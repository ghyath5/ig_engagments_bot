import axios from "axios";
import { adminId, bot } from "./global";
import * as Tunnel from 'tunnel';
import IG, { proxies } from "./instagram";
class ProxyScraper{
    limit:number = 400;
    checkTimes:number = 2;
    current:number = 0;
    all:number;
    working:{ip:string,port:string}[]=[]
    constructor({limit,checkTimes}:{limit:number,checkTimes:number}){
        this.limit = limit;
        this.checkTimes = checkTimes
    }
    async start(){
        try{
            let proxies:any = await axios.get(`https://api.proxyscrape.com/?request=displayproxies&proxytype=http&anonimity=elite,anonymous&limit=${this.limit}`)
            proxies = proxies.data.split('\r\n').filter((o:string)=>o)
            this.all = proxies.length
            proxies.map((p:string)=>{
                if(!p)return;
                let splitedText = p.split(':')
                let proxy:{ip:string,port:string} = {ip:splitedText[0],port:splitedText[1]}
                this.checker(proxy)
            })
        }catch(e){
            bot.telegram.sendMessage(adminId,`Scraping Error:${(e as any).message}`)
        }
    }
    async checker(proxy:{ip:string,port:string},url='https://www.instagram.com'){
        console.log('Checking...',proxy.ip,proxy.port);
        let tunnel = Tunnel.httpsOverHttp({
            proxy: {
                host: proxy.ip,
                port: Number(proxy.port)
            },
        });
        let checkTime = 1;
        const check = async ()=>{
            console.log('Check time',checkTime);
            
            const source = axios.CancelToken.source();
            const timeout = setTimeout(() => {
                source.cancel('timeout');
            }, 8000);
            return new Promise((resolve)=>{
                axios(url,
                    {
                    proxy:false,
                    cancelToken: source.token,
                    timeout:8000,
                    ...(tunnel&&{httpsAgent:tunnel,httpAgent:tunnel})
                    }
                ).then(async ()=>{
                    if(this.checkTimes>checkTime){
                        checkTime++;
                        await IG.sleep(500,2000)
                        return resolve(check())
                    }
                    return resolve(true);
                })
                .catch((e)=>{
                    return resolve(false)
                }).finally(()=>{
                    clearTimeout(timeout)
                })
            })
        }
        let state = await check()
        if(state){
            this.working.push(proxy);
        }
        this.current++;
        if(this.all <= this.current && this.working.length>0){
            proxies.push(this.working)
            bot.telegram.sendMessage(adminId,`Saving ${this.working.length} proxies`)
        }
    }
}
setInterval(()=>{
    let scraper = new ProxyScraper({limit:800,checkTimes:2})
    scraper.start()
},60000*20)
