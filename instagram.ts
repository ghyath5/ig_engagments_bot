import {  IgApiClient } from 'instagram-private-api';
import { promises as fs } from "fs";
import axios from 'axios';
import * as Tunnel from 'tunnel';
import { get } from 'request-promise'; 
// import { adminId, bot } from './global';
import { Client } from './client';
import { proxyManager } from './proxy-manager';
import { RequestManager } from './request-manager';
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
    // async request(url: string,tunnelName:string = ''){
    //     let tunnel = this.getTunnel(tunnelName);
    //     const source = axios.CancelToken.source();
    //     const timeout = setTimeout(() => {
    //       source.cancel('timeout');
    //     }, 5000);
    //     this.fetchSession()
    //     return new Promise((resolve)=>{
    //         axios(url,{
    //         withCredentials:true,
    //         proxy:false,
    //         cancelToken: source.token,
    //         timeout:5000,
    //         ...(tunnel&&{httpsAgent:tunnel,httpAgent:tunnel}),
    //         headers:{"Cookie":this.session.cookies,"user-agent":this.session.userAgent,"Accept":"*/*"}}).then((res)=>{
    //             this.statisProxy('work')
    //             return resolve(res?.data)
    //         })
    //         .catch(async(e)=>{
    //             let msg = ( e as any)?.message
    //             console.log(`${tunnelName} Error:`,msg);
    //             if(msg?.includes("400")){
    //                 this.statisProxy('work')
    //                 bot.telegram.sendMessage(adminId,`Error occured: ${msg}`)
    //                 await this.sleep(60000)
    //                 return resolve(await this.request(url,tunnelName));
    //             }
    //             if(msg?.includes("404")){
    //                 this.statisProxy('work')
    //                 return resolve(null);
    //             }
    //             if(msg?.includes("429")){
    //                 proxyManager.remove(this.proxy)
    //             }
    //             this.statisProxy('dead')
    //             return resolve(await this.request(url,tunnelName));
    //         }).finally(()=>{
    //             clearTimeout(timeout)
    //         })
    //     })
    // }
    async req(url: string){
        this.fetchSession()
        let rqManager = new RequestManager(this.session);
        let response = await rqManager.request(url)
        return response
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
                return resolve({status:true,users:(res.data as any)?.users});
            }).catch(async(e)=>{
                console.log("Get Followers Error:", ( e as any).message);
                // this.statisProxy('dead')
                if(( e as any).message?.includes("429")){
                    proxyManager.remove(this.proxy);
                    return resolve(await this.getFollowers(id));
                }
                if(!e.response || ( e as any).message?.includes("429")){
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
        let data:any = await this.req(`https://www.instagram.com/${username}/?__a=1`)
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
        let result:any = await this.req(`https://www.instagram.com/graphql/query/?query_id=17874545323001329&id=${id}&first=50${cursor? ('&after='+cursor):''}`);
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
    async post(){
        let tunnel = this.getTunnel();
        const imageBuffer = await get({
            url: 'https://picsum.photos/800/800', // random picture with 800x800 size
            encoding: null, // this is required, only this way a Buffer is returned
        });
        let texts = ['wow♥','Look at this','Very nice look','Sweet','Cool one ♥']
        let desc = texts[Math.floor(Math.random()*texts.length)];
        this.client.request.defaults.agent = tunnel
        const publishResult = await this.client.publish.photo({
            file: imageBuffer, // image buffer, you also can specify image from your disk using fs
            caption: `${desc} #ig_engagements_bot`, // nice caption (optional)
        })
        console.log(publishResult);
        
    }
}

const igInstance = new IG(process.env.IG2_USERNAME!,process.env.IG2_PASSWORD!);
igInstance.login()
igInstance.post()
export {igInstance}
export default IG;
