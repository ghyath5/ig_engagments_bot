import { IgApiClient } from 'instagram-private-api';
import { promises as fs } from "fs";
import * as Tunnel from 'tunnel';
import { Client } from './client';
import { proxyManager } from './proxy-manager';
import { RequestManager } from './request-manager';
import { igImage } from './pick-image';
import { adminId, bot } from './global';
export const credentials = [
   // {
     //   username: 'ig_engagements_bot',
     //   password: 'Ghyath#123!'
   // },
    {
        username: 'tist_acco',
        password: 'tIsT-AcCo'
    },
    {
        username: process.env.IG_USERNAME!,
        password: process.env.IG_PASSWORD!,
    },
    {
        username: process.env.IG2_USERNAME!,
        password: process.env.IG2_PASSWORD!,
    }
]

let index = -1;
export const getCredentials = () => {
    index = index + 1
    if (index >= credentials.length) index = 0;
    return credentials[index]
}
class IG {
    username: string
    session: { userAgent: string; appAgent: string; cookies: string; };
    client: IgApiClient;
    password: string
    proxy: { ip: string, port: string, pass?: string, username?: string };
    constructor() {
        const { username, password } = getCredentials()
        console.log('Signal:', username);
        this.username = username;
        this.password = password
        this.client = new IgApiClient();
        this.client.state.generateDevice(this.username);
    }
    static async sleep(min: number, max: number) {
        const ms = Math.floor(Math.random() * (max - min + 1) + min)
        return await new Promise(r => setTimeout(() => r(true), ms))
    }
    static async getInstance() {
        const igInstance = new IG();
        await igInstance.login()
        return igInstance;
    }
    async req(url: string, headers = null, params = {}) {
        this.fetchSession()
        let rqManager = new RequestManager(this.session, headers, params);
        let response = await rqManager.request(url)
        return response
    }
    async login() {
        const userId = await this.loadSession()
        if (!userId) {
            try {
                await this.client.simulate.preLoginFlow();
                let me = await this.client.account.login(this.username, this.password);
                this.saveSession();
                await this.client.simulate.postLoginFlow();
                return me;
            } catch (e) {
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
    async loadSession() {
        try {
            const sessionFile = await fs.readFile(`./sessions/${this.username}.json`, "utf-8");
            await this.client.state.deserialize(sessionFile);
            const userId = this.client.state.cookieUserId;
            return userId;
        } catch (e) {
            console.log("IG error loadSession:", e)
            return false
        }
    }
    fetchSession() {
        try {
            let cookies = `csrftoken=${this.client.state.extractCookieValue('csrftoken')};mid=${this.client.state.extractCookieValue('mid')};rur=${this.client.state.extractCookieValue('rur')};ds_user_id=${this.client.state.extractCookieValue('ds_user_id')};sessionid=${this.client.state.extractCookieValue('sessionid')}`
            this.session = {
                userAgent: this.client.state.webUserAgent,
                appAgent: this.client.state.appUserAgent,
                cookies
            }
        } catch (e) { }
    }
    async sleep(ms: number | undefined) {
        return await new Promise((r) => setTimeout(r, ms));
    }
    async getAllFollowers(id: string) {
        let result = await this.getFollowers(id) as { status: boolean, users?: any[] };
        if (result.status) {
            return result.users?.map((user) => user.username);
        }
        return null;
    }
    async getFollowers(id: string) {
        this.fetchSession()
        let headers: any = this.client.request.getDefaultHeaders()
        headers = {
            ...headers,
            'X-IG-EU-DC-ENABLED': 'undefined',
            Authorization: '',
            "Cookie": this.session.cookies
        }
        const params = {
            order: 'default',
            query: '',
            count: 999999
        }
        let data = await this.req(`https://i.instagram.com/api/v1/friendships/${id}/followers/`, headers, params)
        if (!data?.users) return { status: false }
        console.log(data.users.length);
        return { status: true, users: data.users }
    }
    async checkProfile(username: any, userPk?) {
        if (userPk) {
            let client = new Client(userPk);
            await client.getLang()
            client.translate('handlingRequest').send()
        }
        let data: any = await this.req(`https://www.instagram.com/${username}/?__a=1`)
        return data?.graphql?.user
    }
    getTunnel(func = 'Trying') {
        let tunnel;
        this.proxy = proxyManager.getProxy()
        if (this.proxy) {
            console.log(func, 'Proxy:', this.proxy?.ip);
            tunnel = Tunnel.httpsOverHttp({
                proxy: {
                    host: this.proxy.ip,
                    port: Number(this.proxy.port),
                    ...(this.proxy.pass && { proxyAuth: `${this.proxy.username}:${this.proxy.pass}` })
                },
            });
        }
        return tunnel
    }
    async getFollowing(id: string, cursor?: string) {
        let result: any = await this.req(`https://www.instagram.com/graphql/query/?query_id=17874545323001329&id=${id}&first=50${cursor ? ('&after=' + cursor) : ''}`);
        return result?.data?.user?.edge_follow
    }
    async checkIfollowed(username: string, id: string, cursor?: string) {
        let result = await this.getFollowing(id, cursor) as { count: number, edges: any[], page_info: any };
        if (!result?.count || !result.edges?.length) return false;
        let usernames = result.edges.map((edge) => edge.node.username);
        if (usernames.includes(username)) return true;
        // if(!result.page_info?.has_next_page)return false;
        // return await this.checkIfollowed(username,id,result.page_info.end_cursor);
        return false;
    }
    async post() {
        let tries = 0;
        console.log('Getting image');
        let { desc, image } = await igImage()
        if (!image) {
            bot.telegram.sendMessage(adminId, 'Faild getting image buffer')
            return true;
        }
        const make = async () => {
            tries++;
            let tunnel = this.getTunnel();
            this.client.request.defaults.agent = tunnel
            this.client.request.defaults.timeout = 8000;
            console.log('Uplading');
            const publishResult = await this.client.publish.photo({
                file: image, // image buffer, you also can specify image from your disk using fs
                caption: desc
            }).catch(async (e) => {
                console.log('retrying', e.message);
                if (e.message.includes('Bad Request')) return null;
                if (tries >= 20) return null;
                await this.sleep(1000);
                return await make()
            })
            return publishResult
        }
        return await make()
    }
}

// const igInstance = new IG(process.env.IG_USERNAME!, process.env.IG_PASSWORD!);
// igInstance.login()
// export { igInstance }
export default IG;
