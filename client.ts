import { bot, IG, MyContext, randomItem } from './global';
import { Redis } from './redis';
import { ExtraReplyMessage } from 'telegraf/typings/telegram-types';
import { PrismaClient, User } from '@prisma/client';
import { Keyboard } from './keyboard';
import Queue from 'bee-queue';
import { igInstance } from './instagram';
const queue = new Queue('following',{
    redis:{
        url:process.env.DB_REDIS_URL
    }
});
const prisma = new PrismaClient()
const credentials = [
    {
        username:process.env.IG_USERNAME!,
        password:process.env.IG_PASSWORD!,
    },
    {
        username:process.env.IG2_USERNAME!,
        password:process.env.IG2_PASSWORD!
    }
]
let index = 1;
const getCredentials = ()=>{
    index = index == 0?1:0;
    return credentials[index]
}
export class Client {
    async checkIfollowed(username: string, user: User) {
        const myUsername = user.igUsername;
        const job = queue.createJob({username,userId:user.igId});
        job.save();
        job.on('succeeded', async (result) => {
            let [followedAccounts] = await Promise.all([
                this.followedAccounts()
            ]);
            if(followedAccounts.includes(username))return;
            if(result){
                bot.telegram.sendMessage(this.pk,`${this.translate('youvfollowed',{username:username}).msg}\n${this.translate('moregemsmorefollowers').msg}`,
                {
                    parse_mode:"HTML"
                }
                )
                let otherUser = await this.findUserByUsername(username);
                if(!otherUser)return;
                let otherClient = new Client(otherUser.id,undefined,this.ctx);
                let userLang = await otherClient.getLang();
                bot.telegram.sendMessage(otherUser.id,`<b>${myUsername}</b> ${otherClient.translate('followedyou',{},userLang).msg}`,{
                    ...this.keyboard.inlineKeyboard([{text:this.translate('startfollowbtn').msg,callback_data:"sendusertofollow"}]),
                    parse_mode:"HTML"});
                this.saveFollowAction(otherUser.id)
            } 
        });
        this.translate('wearechecking').send();
        await this.addAccountToSkipped(username);
    }
    ctx?:MyContext;
    lang: string;
    pk: number
    redis:Redis
    keyboard:Keyboard
    username:string|undefined
    constructor(pk:number,lang:string='en',ctx?:MyContext){
        this.ctx = ctx;
        this.lang = lang;
        this.pk = pk;
        this.redis = new Redis(this.pk);
        this.keyboard = new Keyboard(this);
    }
    async saveFollowAction(otherUserId){
        await prisma.user.update({
            where:{id:this.pk},
            data:{gems:{increment:1}}
        })
        await prisma.user.update({
            where:{
                id:otherUserId},
                data:{gems:{decrement:1}}
        })
        return await prisma.account.create({
            data:{
                followed_id:otherUserId,
                follower_id:this.pk
            }
        })
    }
    async followedAccounts(){
        let followed = await prisma.account.findMany({where:{follower_id:{equals:this.pk}},select:{followed:{select:{igUsername:true}}}})
        return followed.map((follow)=>follow.followed.igUsername)
    }
    async save(username: string,userId):Promise<{linked:boolean,message?:string}>{
        this.username = username;
        return await new Promise((resolve)=>{
            prisma.user.upsert({
                where:{id:this.pk},
                create:{id:this.pk,igUsername:username,igId:userId},
                update:{igUsername:username}
            }).catch(e=>{
                if(e.message.includes("Unique"))
                    resolve({linked:false,message:this.translate("constraintUsername").msg})                
            }).then(()=>{
                this.redis.del('sendingusername');
                return resolve({linked:true})
            })
        })
    }
    async findUserByUsername(username: string):Promise<User|null>{
        return await prisma.user.findUnique({where:{igUsername:username}});
    }
    async profile():Promise<User | null>{
        let user = await prisma.user.findUnique({where:{id:this.pk}})
        this.username = user?.igUsername;
        return user;
    }
    async getUsername(){
        return this.username || (await this.profile())?.igUsername || "ghyathdarwish"

    }
    setLang(lang:string){
        this.lang = lang;
        this.redis.setProfileData(`locale`,lang);
    }
    async getLang(){
        return await this.redis.getProfileData(`locale`) || 'en';
    }
    translate(key:string,vars={},lang = this.lang){
        const msg = this.ctx?.i18n.__({phrase:key,locale:lang},vars)
        return {
            msg:msg!,
            send:(extra:ExtraReplyMessage={})=>{
                return this.sendMessage(msg!,extra);
            }
        }
    }
    sendMessage(msg: string,extra:ExtraReplyMessage={}){
        return bot.telegram.sendMessage(this.pk,msg,{...extra,parse_mode:"HTML"})
    }
    
    generateAccountLink(username: string){
        return `<a href='https://www.instagram.com/${username}'>@${username}</a>`
    }
    async getIGProfile(username = this.username){
        let  [me,user] = await Promise.all([
            this.profile(),
            igInstance.checkProfile(username) as any
        ])
        if(!user){
            console.log("No uUSER");
            return this.translate('notuserfound').send();
        }
        bot.telegram.sendPhoto(this.pk,{
            url:user.profile_pic_url_hd,
        },
        {
            ...this.keyboard.changeProfileBtn(),
            caption:`${this.translate('account').msg}: ${this.generateAccountLink(user.username)}\n\n${this.translate('following').msg}: <b>${user.edge_follow.count}</b>\n\n${this.translate('followers').msg}: <b>${user.edge_followed_by.count}</b>\n\n${this.translate('gems').msg}: <b>${me?.gems}</b> 💎`,
            parse_mode:"HTML",
        }
        )
    }
    async sendHomeMsg(){
        let username =(await this.profile())?.igUsername
        if(username){
            return this.translate(`startfollow`).send(this.keyboard.home());
        }
        this.redis.set(`sendingusername`,'true',{"EX":60*60})
        return this.translate(`sendUrUsername`).send();
    }
    async accountSkipped():Promise<string[]>{
        return JSON.parse(await this.redis.get('skipped')||"[]");
    }
    async addAccountToSkipped(username: string){
        let accounts = await this.accountSkipped();
        if(accounts.length > 5){
            accounts.shift();
        }
        accounts.push(username)
        this.redis.set('skipped',JSON.stringify(accounts),{"EX":60*60});
    }
    async sendUser(){
        let me = await this.profile();
        if(!me){
            return this.sendHomeMsg()
        }
        const accountsSkipped = await this.accountSkipped();
        // const queryWhere = {
        //     id:{not:{equals:this.pk}},
        //     follower:{every:{follower_id:{n:this.pk}}},
        //     igUsername:{notIn:accountsSkipped},
        //     gems:{gte:3}
        // }
        // let accountsCount = await this.ctx?.prisma.user.count({where:queryWhere})
        // accountsCount ||= 0;
        // let skip = Math.floor(Math.random() * accountsCount);
        let account = await this.ctx?.prisma.user.findFirst({
            take: 1,
            where:{
                id:{not:{equals:this.pk}},
                followed:{
                    none:{
                        follower_id:{equals:this.pk}
                    }
                },
                igUsername:{notIn:accountsSkipped},
                gems:{gte:3}
            },
            orderBy: {
                gems:"desc"
            },
        });
        if(!account)return this.translate('notusertofolw').send();
        // const user = await igInstance.checkProfile(account.igUsername) as any;
        // if(!user)return;
        bot.telegram.sendMessage(this.pk,`${this.translate('dofollow',{username:account.igUsername}).msg}\n${this.translate('moregemsmorefollowers').msg}`,
        {
            ...this.keyboard.panel(account.igUsername),
            parse_mode:"HTML",
        }
        )
    }
}

queue.process(async (job)=> {
    const {username,password} = getCredentials();
    const ig = new IG(username,password);
    await ig.login()
    await IG.sleep(4000,8000);
    const isFollowed = await ig.checkIfollowed(job.data.username, job.data.userId);
    return isFollowed;
});