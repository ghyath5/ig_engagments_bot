import {  IgApiClient } from 'instagram-private-api';
import { SocksProxyAgent } from 'socks-proxy-agent'
import { promises as fs } from "fs";
import axios from 'axios';
// import {HttpsProxyAgent} from 'https-proxy-agent';
import { adminId, bot } from './global';

let proxied = false;
import { client } from './redis';
// import { bot } from './global';
// const blockedIp = {
//     async set(v:string){
//         let ips = JSON.parse(await  client.get('blockedIps')||"[]");
//         ips.push(v);
//         client.set('blockedIps',JSON.stringify(ips));
//     },
//     async get(){
//         return JSON.parse(await  client.get('blockedIps')||"[]");
//     }
// }
const proxies = {
    async get(){
        return JSON.parse(await  client.get('proxies')||"[]");
    },
    async remove(ip: string){
        let proxies = JSON.parse(await  client.get('proxies')||"[]");
        let filtered = proxies.filter((proxy)=>proxy.ip != ip);
        client.set('proxies',JSON.stringify(filtered));
    }
    
}
let proxyIndex = -1;
const getProxy = async ()=>{
    proxyIndex++
    let poxis = await proxies.get();
    try{
        let host = poxis[proxyIndex]
        if(proxyIndex >= poxis.length){
            proxyIndex = 0;
        }
        return host
    }catch(e){
        proxyIndex = 0;
        return null;
    }
}
class IG {
    username:string
    session: { userAgent: string; appAgent: string; cookies: string; };
    client:IgApiClient;
    password:string
    proxy:string;
    protocols:string[] = ['socks4','socks5'];
    triedProtocols:string[] = [];
    constructor(username: string,password: string){
        this.username = username;
        this.password = password
        this.client = new IgApiClient();
        this.client.state.generateDevice(this.username);
    }
    static async sleep(min:number,max:number){
        const ms = Math.floor(Math.random() * (max - min + 1) + min)
        return await new Promise(r => setTimeout(() => r(true), ms))
    }
    async login(){
        // this.proxy = await getProxy()
        // if(this.proxy){
        //     if(this.proxy.type){
        //         let proxy = `${this.proxy.type}://${this.proxy.ip}:${this.proxy.port}`
        //         console.log(`Im using ${proxy}`);
        //         this.client.request.defaults.agent = new SocksProxyAgent(proxy);
        //     }else{
        //         this.client.request.defaults.agent = new SocksProxyAgent({
        //             host:this.proxy.ip,
        //             port:this.proxy.port,
        //             ...(this.proxy.password&&{userId:this.proxy.username,password:this.proxy.password})
        //         })
        //         console.log('Im using '+ this.proxy.ip,this.proxy.port);
        //     }
        //     this.client.request.defaults.timeout = 25000;
        // }
        const userId = await this.loadSession()
        if(!userId){
            try{
                await this.client.simulate.preLoginFlow();
                let me = await this.client.account.login(this.username,this.password);
                this.saveSession();
                await this.client.simulate.postLoginFlow();
                return me;
            }catch(e){
                console.log("IG error login:", e)
                return false;
            }
        }
        this.saveSession();
        return userId;
    }
    saveSession() {
        this.client.request.end$.subscribe(async () => {
            const serialized = await this.client.state.serialize();
            delete serialized.constants;
            fs.writeFile(`./sessions/${this.username}.json`, JSON.stringify(serialized), "utf-8")
        });
    }
    async loadSession(){
        try {
            const sessionFile = await fs.readFile(`./sessions/${this.username}.json`, "utf-8");
            await this.client.state.deserialize(sessionFile);
            const userId =  this.client.state.cookieUserId;
            return userId;
        } catch (e) {            
            console.log("IG error loadSession:", e)
            return false
        }
    }
    fetchSession(){
        try {
            let cookies = `csrftoken=${this.client.state.extractCookieValue('csrftoken')};mid=${this.client.state.extractCookieValue('mid')};rur=${this.client.state.extractCookieValue('rur')};ds_user_id=${this.client.state.extractCookieValue('ds_user_id')};sessionid=${this.client.state.extractCookieValue('sessionid')}`

            this.session = {
                userAgent: this.client.state.webUserAgent,
                appAgent: this.client.state.appUserAgent,
                cookies
            }
        } catch (e) { }
    }
    // async checkProfile(username: any){
    //     return new Promise((resolve)=>{
    //         axios(`https://www.instagram.com/${username}/channel/?__a=1`,{withCredentials:true,headers:{
    //             "Accept":"*/*",
    //             "user-agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.81 Safari/537.36"
    //         }}).then((res)=>resolve((res?.data as any).graphql?.user)).catch((e)=>resolve(false))
    //     })
    // }
    async checkProfile(username: any){
        this.fetchSession()
        return new Promise((resolve)=>{
            axios(`https://www.instagram.com/${username}/?__a=1`,{withCredentials:true,headers:{"Cookie":this.session.cookies,"user-agent":this.session.userAgent,"Accept":"*/*"}}).then((res)=>resolve((res?.data as any).graphql?.user)).catch((e)=>{
                resolve(false)
            })
        })
    }
    async getProxy(){
        try{
            let res = await axios.get('https://api.proxyorbit.com/v1/?instagram=true&protocol=socks4&token=zkec6DVcaDJkmuLnef5PN4jr0M1smRo57myp-vW6M78');
            let data = res.data as any;
            if(data.curl){
                (async()=>{
                    let prxis = await proxies.get();
                    prxis.push(data.curl)
                    client.set('proxies',JSON.stringify(prxis));
                })();
                return data.curl;
            }
        }catch(e){
            let err = e as any;
            console.log(err.toString()); 
            bot.telegram.sendMessage(adminId,'No Ip found');
            return false;
        }
    }
    async getFollowing(id:string,cursor?:string){
        let agent;
        let prxis = await proxies.get();
        if(!prxis?.length || prxis.length <15){
            this.proxy = await this.getProxy()
            agent = new SocksProxyAgent(this.proxy);
            console.log('New proxy',this.proxy);
        }else{
            this.proxy = await getProxy();
            agent = new SocksProxyAgent(this.proxy);
            console.log('saved proxy ',this.proxy);
        }
        this.fetchSession()
        return await new Promise((resolve)=>{
            axios(`https://www.instagram.com/graphql/query/?query_id=17874545323001329&id=${id}&first=50${cursor? ('&after='+cursor):''}`,{withCredentials:true,
            proxy:false,
            ...(agent&&{httpAgents:agent}),headers:{"Cookie":this.session.cookies,"user-agent":this.session.userAgent,"Accept":"*/*"}}).then((res)=>{
               return resolve((res.data as any)?.data?.user.edge_follow);
            }).catch(async(e)=>{
                console.log("Get Following Error:", ( e as any).message);
                await new Promise((resolve)=>setTimeout(resolve,5000));
                return resolve(await this.getFollowing(id,cursor));
            })
        })
    }
    async checkIfollowed(username:string,id:string,cursor?:string){
        let result = await this.getFollowing(id,cursor) as {count:number,edges:any[],page_info:any};
        if(!result?.count || !result.edges?.length)return false;
        let usernames = result.edges.map((edge)=>edge.node.username);
        if(usernames.includes(username)) return true;
        // if(!result.page_info?.has_next_page)return false;
       // return await this.checkIfollowed(username,id,result.page_info.end_cursor);
         return false;
    }
    // async checkIfollowed(username: string,id:string,protocolUsed?:string){
    //     return await new Promise(async (resolve,reject)=>{
    //         try{
    //             username =  username.toLowerCase()
    //             let feed = this.client.feed.accountFollowing(id);
    //             async function getAllItemsFromFeed(feed: AccountFollowingFeed) {
    //                 let items:any = [];
    //                 do {
    //                     items = items.concat(await feed.items());
    //                     const time = Math.round(Math.random() * 5000) + 1000;
    //                     await new Promise(resolve => setTimeout(resolve, time));
    //                 } while (feed.isMoreAvailable());
    //                 return items;
    //             }
    //             let items =  await getAllItemsFromFeed(feed)
    //             protocolUsed && console.log('Succedded protocol: ',protocolUsed);
    //             !protocolUsed && console.log('Succedded proxy: ',this.proxy.ip,this.proxy.port);
    //             return resolve(items.some((item)=>(item as any).username == username))
    //         }catch(e){
    //             let removed = true;
    //             if((e as any).message.includes('429')){
    //                 bot.telegram.sendMessage('566571423',`Too many requests at ${JSON.stringify(this.proxy)}`)
    //                 removed = false;
    //             }
    //             console.log("IG error checkIfollowed:", (e as any).message)
    //             return resolve(await this.recallWithDifferentProtocol(async (protocoleUsed)=>{
    //                 return await this.checkIfollowed(username,id,protocoleUsed)
    //             },removed));
    //         }
    //     })
    // }

    // async recallWithDifferentProtocol(func,remove = true){
    //     let setOfProtocols = this.protocols.filter((protocol)=>!this.triedProtocols.includes(protocol))
    //     if(setOfProtocols.length > 0){
    //         let protocol:string = setOfProtocols[0]
    //         this.triedProtocols.push(protocol)
    //         let proxy = `${protocol}://${this.proxy.ip}:${this.proxy.port}`
    //         console.log('Trying another protocol ',proxy);
    //         if(protocol == 'http'){
    //             this.client.state.proxyUrl = proxy;
    //         }else{
    //             this.client.request.defaults.agent = new SocksProxyAgent(proxy);
    //         }
    //         return await func(protocol)
    //     }
    //     (async (ip)=>{
    //         if(!remove){
    //             return bot.telegram.sendMessage('566571423',`Proxy NOT Removed: ${ip}\nProxies Number: ${proxyIndex+1}/${(await proxies.get()).length}`)
    //         }
    //         await proxies.remove(ip)
    //         bot.telegram.sendMessage('566571423',`Proxy Removed: ${ip}\nProxies Number: ${proxyIndex+1}/${(await proxies.get()).length}`)
    //     })(this.proxy.ip);
    //     this.triedProtocols = [];
    //     this.proxy = await getProxy();
    //     console.log('Trying another Proxy: ',this.proxy);
    //     if(this.proxy){
    //         if(this.proxy.type){
    //             this.client.request.defaults.agent = new SocksProxyAgent(`${this.proxy.type}://${this.proxy.ip}:${this.proxy.port}`);
    //         }else{
    //             this.client.request.defaults.agent = new SocksProxyAgent({
    //                 host:this.proxy.ip,
    //                 port:this.proxy.port,
    //                 ...(this.proxy.password&&{userId:this.proxy.username,password:this.proxy.password})
    //             })
    //         }
            
    //     }
    //     return await func();
    // }
}
// addQueue.process(function (job, done) {
//     console.log(`Processing job ${job.id}`);
//     return done(null, job.data.id);
// });
const igInstance = new IG(process.env.IG_USERNAME!,process.env.IG_PASSWORD!);
igInstance.login()
export {igInstance}
export default IG;
