import { createClient } from 'redis';
import {RedisClientType} from 'redis/dist/lib/client'
export const client = createClient({url:process.env.DB_REDIS_URL});
client.connect();

export class Redis {
    pk:number;
    profileKey:string;
    client:RedisClientType=client;
    constructor(pk: number){
        this.pk = pk;
        this.profileKey = `${this.pk}:profile`;
    }
    async getLocale(){
        return await this.getProfileData('locale') || undefined
    }
    async get(key:string){
        return await this.client.get(`${this.pk}:${key}`);
    }
    async del(key:string){
        return await this.client.del(`${this.pk}:${key}`);
    }
    set(key: string,value: string | Buffer, options){
        return this.client.set(`${this.pk}:${key}`,value,options)
    }
    async getProfileData(field: string){
        return await client.hGet(this.profileKey,field)
    }
    async hIncrBy(field,by=1){
        return await client.hIncrBy(this.profileKey,field,by)
    }
    setProfileData(...fields: any[]){
        client.hSet(this.profileKey,fields)
    }
    async followed(){
        return JSON.parse(await this.getProfileData('followed')||"[]");
    }
    async setFollowed(username: string){
        let followed = await this.followed();
        followed.push(username)
        this.setProfileData('followed',JSON.stringify(followed));
    }
    async getAll(){
        return await client.keys('account:*')
    }

}