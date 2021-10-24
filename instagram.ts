import { AccountFollowingFeed, IgApiClient } from 'instagram-private-api';
import { SocksProxyAgent } from 'socks-proxy-agent'
const ig = new IgApiClient();
import { promises as fs } from "fs";
import axios from 'axios'
import { randomItem } from './global';
// import Queue from 'bee-queue';
// const addQueue = new Queue('checking',{
//     redis:{url:process.env.DB_REDIS_URL},
// });
let useProxy = false;
class IG {
    username:string
    session: { userAgent: string; appAgent: string; cookies: string; };
    client = ig;
    password:string
    constructor(username: string,password: string){
        this.username = username;
        this.password = password
        ig.state.generateDevice(this.username);
        if(!useProxy){
            let hosts = process.env.PROXY_IP!.split(',')!
            let host = hosts[Math.floor(Math.random()*hosts.length)].split(':')
            let userId = host[0]
            let password = host[1];
            let ip = host[2];
            let port = host[3];
            ig.request.defaults.agent = new SocksProxyAgent({
                host:ip,
                port:port,
                userId,
                password
            })
            console.log('Im using '+ ip,port);
            useProxy = true;        
        }else {
            useProxy = false;
            console.log("Now I am regular request");
        }
    }
    static async sleep(min:number,max:number){
        const ms = Math.floor(Math.random() * (max - min + 1) + min)
        return await new Promise(r => setTimeout(() => r(true), ms))
    }
    async login(){
        const userId = await this.loadSession()
        if(!userId){
            try{
                await this.client.simulate.preLoginFlow();
                let me = await this.client.account.login(this.username,this.password);
                await this.client.simulate.postLoginFlow();
                this.saveSession();
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
    async checkIfollowed(username: string,id:string){
        return await new Promise(async (resolve)=>{
            try{
                username =  username.toLowerCase()
                let feed = this.client.feed.accountFollowing(id);
                async function getAllItemsFromFeed(feed: AccountFollowingFeed) {
                    let items:any = [];
                    do {
                        items = items.concat(await feed.items());                
                        const time = Math.round(Math.random() * 900) + 500;
                        await new Promise(resolve => setTimeout(resolve, time));
                    } while (feed.isMoreAvailable());
                    return items;
                }
                
                let items =  await getAllItemsFromFeed(feed)
                return resolve(items.some((item)=>(item as any).username == username))
            }catch(e){
                console.log("IG error checkIfollowed:", e)
            }
        })
    }
}
// addQueue.process(function (job, done) {
//     console.log(`Processing job ${job.id}`);
//     return done(null, job.data.id);
// });
const igInstance = new IG(process.env.IG_USERNAME!,process.env.IG_PASSWORD!);
igInstance.login()
export {igInstance}
export default IG;