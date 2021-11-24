import axios from "axios";
import { adminId, bot } from "./global";
import * as Tunnel from 'tunnel';
import { client } from "./redis";
// import eventemitter from "./eventemitter";
type ProxyType = {
    ip:string;
    port:string;
    pass?:string,username?:string
}
export const storedProxies = {
    async get(){
        return JSON.parse(await  client.get('proxies')||"[]");
    },
    async push(newProxies){
        let all = await storedProxies.get()
        all = all.filter((p)=>{
            return !newProxies.some((proxy)=>proxy.port == p.port && proxy.ip == p.ip)
        })
        all.push(...newProxies)
        client.set('proxies',JSON.stringify(all));
    },
    async remove(pr){
        if(!pr)return;
        let proxies = JSON.parse(await  client.get('proxies')||"[]");
        let filtered = proxies.filter((proxy)=>proxy.ip != pr?.ip);
        client.set('proxies',JSON.stringify(filtered));
    }
};
export class ProxyManager{
    limit:number = 400;
    checkTimes:number = 0;
    current:number = 0;
    all:number;
    working:ProxyType[]=[]
    storedProxies:ProxyType[]=[]
    constructor(){
        storedProxies.get().then((all)=>this.storedProxies = all)
    }
    async start(){
        console.log('Scraping Proxies...');        
        try{
            let proxies:any = await axios.get(`https://api.proxyscrape.com/?request=displayproxies&proxytype=http&anonimity=elite,anonymous`)
            proxies = proxies.data.split('\r\n').filter((o:string)=>o)
            this.all = proxies.length
            proxies.map((p:string)=>{
                if(!p)return;
                let splitedText = p.split(':')
                let proxy:ProxyType = {ip:splitedText[0],port:splitedText[1]}
                if(this.isExist(proxy))return;
                this.checker(proxy)
            })
        }catch(e){
            bot.telegram.sendMessage(adminId,`Scraping Error:${(e as any).message}`)
        }
    }
    async checker(proxy:ProxyType,url='https://www.instagram.com'){
        // console.log('Checking...',proxy.ip,proxy.port);
        let tunnel = Tunnel.httpsOverHttp({
            proxy: {
                host: proxy.ip,
                port: Number(proxy.port)
            },
        });
        let checkTime = 1;
        const check = async ()=>{
            const source = axios.CancelToken.source();
            const timeout = setTimeout(() => {
                source.cancel('timeout');
            }, 5000);
            return new Promise((resolve)=>{
                axios(url,
                    {
                    proxy:false,
                    cancelToken: source.token,
                    timeout:5000,
                    ...(tunnel&&{httpsAgent:tunnel,httpAgent:tunnel})
                    }
                ).then(async ()=>{
                    if(this.checkTimes>checkTime){
                        checkTime++;
                        await new Promise((resolve)=>setTimeout(resolve,1500))
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
        if(!state)return;
        if(this.isExist(proxy))return;
        if(this.working.length>=200){
            this.working.shift()
        }  
        this.working.push(proxy);
    }
    getProxy(){
        let proxies = this.working.length ? this.working : this.storedProxies;
        return proxies[Math.floor(Math.random()*proxies.length)];
    }
    isExist(proxy: ProxyType){
        return Boolean(this.working.find((ep)=>ep.ip == proxy.ip))
    }
    remove(proxy:ProxyType){
        this.working = this.working.filter((p)=>p.ip != proxy.ip)
    }
}
export const proxyManager = new ProxyManager();
proxyManager.start()

setInterval(()=>{
    proxyManager.start()
},60_000*8)