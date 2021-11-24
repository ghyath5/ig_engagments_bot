import {  IgApiClient } from 'instagram-private-api';
import { promises as fs } from "fs";
import axios from 'axios';
import * as Tunnel from 'tunnel';
import { client } from './redis';
import { adminId, bot } from './global';
import { Client } from './client';
import { proxyManager } from './proxy-manager';
// export const proxies = {
//     async get(){
//         return JSON.parse(await  client.get('proxies')||"[]");
//     },
//     async push(newProxies){
//         let all = await proxies.get()
//         all = all.filter((p)=>{
//             return !newProxies.some((proxy)=>proxy.port == p.port && proxy.ip == p.ip)
//         })
//         all.push(...newProxies)
//         client.set('proxies',JSON.stringify(all));
//         initilize()
//     },
//     async remove(pr){
//         if(!pr)return;
//         let proxies = JSON.parse(await  client.get('proxies')||"[]");
//         let filtered = proxies.filter((proxy)=>proxy.ip != pr?.ip);
//         client.set('proxies',JSON.stringify(filtered));
//         initilize()
//     }
// };
// let poxis;
// let statisticsProxies;
// export const initilize = async ()=>{
//     [poxis,statisticsProxies] = await Promise.all([
//         proxies.get(),
//         client.get('statis-proxy')
//     ])
//     statisticsProxies = JSON.parse(statisticsProxies||"[]");
//     return poxis;
// }
// initilize()
// let proxyIndex = -1;
// const getProxy = ()=>{
//     proxyIndex++
//     try{
//         let host = poxis[proxyIndex]
//         if(proxyIndex >= poxis.length){
//             proxyIndex = -1;
//         }
//         return host
//     }catch(e){
//         proxyIndex = -1;
//         return null;
//     }
// }
class IG {
    username:string
    session: { userAgent: string; appAgent: string; cookies: string; };
    client:IgApiClient;
    password:string
    proxy:{ip:string,port:string,pass?:string,username?:string};
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
    async request(url: string,tunnelName:string = ''){
        let tunnel = this.getTunnel(tunnelName);
        const source = axios.CancelToken.source();
        const timeout = setTimeout(() => {
          source.cancel('timeout');
        }, 7000);
        this.fetchSession()
        return new Promise((resolve)=>{
            axios(url,{
            withCredentials:true,
            proxy:false,
            cancelToken: source.token,
            timeout:7000,
            ...(tunnel&&{httpsAgent:tunnel,httpAgent:tunnel}),
            headers:{"Cookie":this.session.cookies,"user-agent":this.session.userAgent,"Accept":"*/*"}}).then((res)=>{
                this.statisProxy('work')
                return resolve(res?.data)
            })
            .catch(async(e)=>{
                let msg = ( e as any)?.message
                console.log(`${tunnelName} Error:`,msg);
                if(msg?.includes("400")){
                    this.statisProxy('work')
                    bot.telegram.sendMessage(adminId,`Error occured: ${msg}`)
                    await this.sleep(60000)
                    return resolve(await this.request(url,tunnelName));
                }
                if(msg?.includes("404")){
                    this.statisProxy('work')
                    return resolve(null);
                }
                if(msg?.includes("429")){
                    proxyManager.remove(this.proxy)
                }
                this.statisProxy('dead')
                return resolve(await this.request(url,tunnelName));
            }).finally(()=>{
                clearTimeout(timeout)
            })
        })
    }
    async login(){
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
    async sleep(ms: number | undefined){
        return await new Promise((r)=>setTimeout(r,ms));
    }
    async getAllFollowers(id:string){
        let result = await this.getFollowers(id) as {status:boolean,users?:any[]};
        if(result.status){
            return result.users?.map((user)=>user.username);
        }
        return null;
    }
    async getFollowers(id:string){
        let tunnel = this.getTunnel();
        const source = axios.CancelToken.source();
        const timeout = setTimeout(() => {
          source.cancel('timeout');
        }, 15000);
        let headers = this.client.request.getDefaultHeaders()
        this.fetchSession()
        return await new Promise((resolve)=>{
            axios(`https://i.instagram.com/api/v1/friendships/${id}/followers/`,{
                params:{
                    order: 'default',
                    query: '',
                    count: 999999
                },
            cancelToken:source.token,
            withCredentials:true,
            timeout:20000,
            proxy:false,
            ...(tunnel&&{httpsAgent:tunnel,httpAgent:tunnel}),
            headers:{
                ...headers,
                'X-IG-EU-DC-ENABLED':'undefined',
                Authorization:'',
                "Cookie":this.session.cookies}}).then((res)=>{
                    this.statisProxy('work')
                return resolve({status:true,users:(res.data as any)?.users});
            }).catch(async(e)=>{
                console.log("Get Followers Error:", ( e as any).message);
                // this.statisProxy('dead')
                if(( e as any).message?.includes("429")){
                    proxyManager.remove(this.proxy);
                    return resolve(await this.getFollowers(id));
                }
                if(!e.response || ( e as any).message?.includes("429")){
                    this.statisProxy('dead')
                    // await this.sleep(800);
                    return resolve(await this.getFollowers(id));
                }
                return resolve({status:false});
            }).finally(()=>{
                clearTimeout(timeout);
            })
        })
    }
    async checkProfile(username: any,userPk?){
        if(userPk){
            let client = new Client(userPk);
            await client.getLang()
            client.translate('handlingRequest').send()
        }
        let data:any = await this.request(`https://www.instagram.com/${username}/?__a=1`,'Profile')
        return data?.graphql?.user
    }
    getTunnel(func='Trying'){
        let tunnel;
        this.proxy = proxyManager.getProxy()
        if(this.proxy){
            console.log(func,'Proxy:', this.proxy?.ip);
            
            tunnel = Tunnel.httpsOverHttp({
                proxy: {
                    host: this.proxy.ip,
                    port: Number(this.proxy.port),
                    ...(this.proxy.pass&&{proxyAuth:`${this.proxy.username}:${this.proxy.pass}`})
                },
            });
        }
        return tunnel
    }
    async getFollowing(id:string,cursor?:string){
        let result:any = await this.request(`https://www.instagram.com/graphql/query/?query_id=17874545323001329&id=${id}&first=50${cursor? ('&after='+cursor):''}`,'Following');
        return result?.data?.user?.edge_follow
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
    async statisProxy(state:string){
        let proxy = {...this.proxy}
        // if(!proxy.ip)return;
        // let found = statisticsProxies.find((one)=>one.ip == proxy.ip && one.port == proxy.port)
        // if(found){
        //     state == 'work' ? found.success = found.success+1 : found.fails = found.fails+1;
        //     found.state = state
        // }else{
        //     found = {
        //         ip:proxy.ip,
        //         port:proxy.port,
        //         success:state == 'work'?1:0,
        //         fails:state == 'dead'?1:0,
        //         state
        //     }
        // }
        // statisticsProxies = statisticsProxies.filter((one)=>!(one.ip == proxy.ip && one.port == proxy.port))
        // if(found.success <= 0 && found.fails >= 5 || ((found.fails / found.success) >= 10 && (found.fails / found.success)<Infinity) && found.state == 'dead'){
        //     poxis = poxis.filter((p)=>!(p.ip == proxy.ip && p.port == proxy.port))
        //     client.set('proxies',JSON.stringify(poxis))
        //     bot.telegram.sendMessage(adminId,`Proxy Deleted: ${found.ip}:${found.port}\nSuccess: ${found.success}\nFails: ${found.fails}\n\nProxies Left: ${poxis.length}`);
        // }else{
        //     statisticsProxies.unshift(found)
        // }
        
        // client.set('statis-proxy',JSON.stringify(statisticsProxies));
    }
}

const igInstance = new IG(process.env.IG_USERNAME!,process.env.IG_PASSWORD!);
igInstance.login()
export {igInstance}
export default IG;
