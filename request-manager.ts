import axios, { CancelTokenSource } from "axios";
import { proxyManager, ProxyType } from "./proxy-manager";
import * as Tunnel from 'tunnel';
import { adminId, bot } from "./global";
type SessionType = { userAgent: string; appAgent: string; cookies: string; };
const sleep = async (mil) => await new Promise((r) => setTimeout(r, mil));
export class RequestManager {
  session: SessionType;
  cancelTokens: CancelTokenSource[] = [];
  proxies: ProxyType[] = []
  requestsAtime: number = 20;
  page: number = 0;
  response: any = null;
  headers: {};
  params: {}
  callResponse: (data) => void;
  constructor(session, headers, params) {
    this.session = session
    this.headers = headers || { "Cookie": this.session.cookies, "user-agent": this.session.userAgent, "Accept": "*/*" }
    this.params = params || {}
  }
  fetchProxies() {
    this.page = 0;
    this.proxies = proxyManager.working
  }
  generateCancelToken() {
    const source = axios.CancelToken.source();
    this.cancelTokens.push(source)
    return source;
  }
  createTunnel(proxy: ProxyType) {
    return Tunnel.httpsOverHttp({
      proxy: {
        host: proxy.ip,
        port: Number(proxy.port)
      },
    });
  }
  getNextProxies() {
    let proxies = this.proxies.slice(this.page * this.requestsAtime, this.page * this.requestsAtime + this.requestsAtime)
    this.page++;
    console.log('Proxies', `${this.page * this.requestsAtime}/${this.proxies.length}`);

    return proxies
  }
  cancelAllRequests() {
    this.cancelTokens.map((source) => {
      source.cancel('done')
    })
  }
  generateRequest(url: string, proxy: ProxyType) {
    const source = this.generateCancelToken()
    const tunnel = this.createTunnel(proxy)
    const timeout = setTimeout(() => {
      source.cancel('timeout');
    }, 5000);
    return new Promise((resolve, reject) => {
      axios(url, {
        params: { ...this.params },
        withCredentials: true,
        proxy: false,
        cancelToken: source.token,
        timeout: 5000,
        ...(tunnel && { httpsAgent: tunnel, httpAgent: tunnel }),
        headers: this.headers
      }).then((res) => {
        console.log('Success');
        return resolve(res?.data)
      }).catch(async (e) => {
        let msg = e.message
        if (msg?.includes("400") && !msg?.includes("tunneling")) {
          bot.telegram.sendMessage(adminId, `Error occured: ${msg}`)
          return resolve(null);
        }
        if (msg?.includes("429")) {
          proxyManager.remove(proxy)
        }
        if (msg?.includes("404")) {
          return resolve(null);
        }
        if(this.page>=4){
         // bot.telegram.sendMessage(adminId, `Maybe stucked: ${msg}`)
          await sleep (8000);
        }
        return reject(false)
      }).finally(() => {
        clearTimeout(timeout)
      })
    })
  }
  async request(url: string) {
    console.log('Try new list');
    this.fetchProxies()
    const send = async () => {
      let proxies: ProxyType[] = this.getNextProxies()
      if (this.response) return this.response;
      if (!proxies.length) {
        await sleep(5000)
        return await this.request(url)
      }
      let promises = proxies.map((proxy) => this.generateRequest(url, proxy))
      try {
        this.response = await Promise.any(promises)
        this.cancelAllRequests()
        return this.response;
      } catch (e) {
        console.log('All rejected');
        return await send()
      }
    }
    return await send()
  }
}
