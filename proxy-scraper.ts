import axios from "axios";
import { adminId, bot } from "./global";
import * as Tunnel from 'tunnel';
import { proxies } from "./instagram";
class ProxyScraper{
    limit:number = 400;
    current:number = 0;
    all:number;
    working:{ip:string,port:string}[]=[]
    constructor({limit}:{limit:number}){
        this.limit = limit;
    }
    async start(){
        try{
            let proxies:any = await axios.get(`https://api.proxyscrape.com/?request=displayproxies&proxytype=http&anonimity=elite&limit=${this.limit}`)
            proxies = proxies.data.split('\r\n').filter((o:string)=>o)
            this.all = proxies.length
            proxies.map((p:string)=>{
                if(!p)return;
                let splitedText = p.split(':')
                let proxy:{ip:string,port:string} = {ip:splitedText[0],port:splitedText[1]}
                this.check(proxy)
            })
        }catch(e){
            bot.telegram.sendMessage(adminId,`Scraping Error:${(e as any).message}`)
        }
    }
    check(proxy:{ip:string,port:string},url='https://www.instagram.com'){
        console.log('Checking...',proxy.ip,proxy.port);
        let tunnel = Tunnel.httpsOverHttp({
            proxy: {
                host: proxy.ip,
                port: Number(proxy.port)
            },
        });
        const source = axios.CancelToken.source();
        const timeout = setTimeout(() => {
          source.cancel('timeout');
        }, 8000);
        axios(url,
            {
            proxy:false,
            cancelToken: source.token,
            timeout:8000,
            ...(tunnel&&{httpsAgent:tunnel,httpAgent:tunnel})
            }
        ).then(()=>{
           this.working.push(proxy)
        })
        .catch((e)=>{}).finally(()=>{
            this.current++;
            clearTimeout(timeout)
            if(this.current >= this.all){
                bot.telegram.sendMessage(adminId,`Saving ${this.working.length} proxies`)
                proxies.push(this.working)
            }
        })
    }
}
setInterval(()=>{
    let scraper = new ProxyScraper({limit:100})
    scraper.start()
},60000*10)
