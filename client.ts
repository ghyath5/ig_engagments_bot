import { adminId, bot, IG, MyContext, } from './global';
import {  Redis } from './redis';
import { ExtraReplyMessage } from 'telegraf/typings/telegram-types';
import { Account, Follow, PrismaClient, User } from '.prisma/client';
import { Keyboard } from './keyboard';
import Queue from 'bee-queue';
import { igInstance } from './instagram';
import i18n from "./locales";
import { I18n } from 'i18n';
import { notifyUnfollowers } from './utls';
import { Context } from 'telegraf';
import { Memory } from './memory';
const isPausedWorker = parseInt(process.env.PAUSE_WORKER||"0")

const queue = new Queue('following',{
    removeOnSuccess:true,
    redis:{
        url:process.env.DB_REDIS_URL
    },
    isWorker:!isPausedWorker
});
const checkerQueue = new Queue('checker',{
    removeOnSuccess:true,
    redis:{
        url:process.env.DB_REDIS_URL
    },
    isWorker:!isPausedWorker
});
const prisma = new PrismaClient()
const credentials = [
    {
        username:'tist_acco',
        password:'tIsT-AcCo'
    },
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
    async enterByLink(id) {
        if(id == this.pk)return;  
        let me = await  prisma.user.findUnique({where:{id:this.pk}});
        if(me)return;
        this.redis.set(`ref`,id,{'EX':60*60*24});
        bot.telegram.sendMessage(adminId,`Someone trying to enter by the someone link.`);
    }
    async checkIfollowed(username: string) {       
        let account = await this.account();
        const myUsername = account.username;
        const job = queue.createJob({usernameToFollow:username,followerIGId:account.igId,followerUsername:myUsername,followerPk:this.pk,followerLang:this.lang});
        job.save();
        // this.translate('wearechecking').send();
    }
    ctx?:MyContext;
    lang: string;
    pk: number
    redis:Redis
    keyboard:Keyboard
    username:string|undefined
    i18n:I18n;
    memory:Memory;
    constructor(pk:number|string,lang:string='en',ctx?:MyContext){
        this.ctx = ctx;
        this.lang = lang;
        this.pk = Number(pk);
        this.redis = new Redis(this.pk);
        this.keyboard = new Keyboard(this);
        this.i18n = i18n;
        this.i18n.setLocale(this.lang);
        this.memory = new Memory(this.pk);
    }
    myLink(){
        return `https://t.me/${process.env.BOT_USERNAME}/?start=${this.pk}`
    }
    async addGems(gems:number){
        return await prisma.user.update({where:{id:this.pk},data:{gems:{increment:gems}}})
    }
    async deductGems(gems:number){
        return await prisma.user.update({where:{id:this.pk},data:{gems:{decrement:gems}}})
    }
    async hasSuffecientGems(gems: number){
        let me = await this.profile();
        return me?.gems >= gems;
    }
    async saveFollowAction(otherUserId:string){
        let account = await this.account()
        await prisma.follow.create({
            data:{
                followed_id:otherUserId,
                follower_id:account.igId
            }
        })
        await prisma.user.update({
            where:{id:this.pk},
            data:{gems:{increment:1}}
        })
        return await prisma.account.update({
            where:{
                igId:otherUserId
            },
            data:{
                owner:{
                    update:{
                        gems:{decrement:1}
                    }
                }
            },
            include:{owner:true}
        })
    }
    async followedAccounts(){
        let account = await this.account();
        let followed = await prisma.follow.findMany({where:{follower_id:{equals:account.igId}},select:{followed:{select:{username:true}}}})
        return followed.map((follow)=>follow.followed.username)
    }
    async save(username: string,userId: string):Promise<{linked:boolean,message?:string}>{
        this.username = username.toLowerCase();
        return await new Promise((resolve)=>{
            prisma.user.upsert({
                where:{id:this.pk},
                create:{
                    id:this.pk,
                    accounts:{
                        create:{
                            igId:userId,
                            username:this.username!,
                            active:true,
                            main:true,
                        }
                    }
                },
                update:{
                    active:true,
                    accounts:{
                        upsert:{
                            where:{
                                igId:userId
                            },
                            update:{
                                igId:userId,
                                username:this.username!,
                                main:true,
                                active:true,
                            },
                            create:{
                                igId:userId,
                                username:this.username!,
                                main:true,
                                active:true,
                            }
                        }
                    }
                }
            }).catch(e=>{
                if(e.message.includes("Unique"))
                    resolve({linked:false,message:this.translate("constraintUsername").msg})                
            }).then(()=>{
                this.checkRef(username)
                this.redis.del('sendingusername');
                return resolve({linked:true})
            })
        })
    }
    async checkRef(username: string) {
        let refId = await this.redis.get(`ref`);
        if(!refId)return;
        prisma.user.update({
            where:{id:Number(refId)},
            data:{
                gems:{increment:1}
            },
            include:{
                accounts:{
                    where:{
                        main:true
                    }
                }
            }
        }).then(async (result)=>{
            bot.telegram.sendMessage(adminId,`${username} entered using ${result.accounts[0].username} link.`);
            let client = new Client(Number(refId));
            await client.getLang();
            client.translate('enterurlink').send()
        }).catch(()=>{})
        this.redis.del(`ref`);
    }
    async findUserByUsername(username: string):Promise<Account&{owner:User}|null>{
        return await prisma.account.findUnique({
            where:{
                username,
            },
            include:{
                owner:true
            }
        });
    }
    async getFollowers(igId: string){
        return await prisma.follow.findMany({where:{followed_id:igId},include:{follower:true}});
    }
    async whoUnfollowMe(){
        let me = await this.account();
        bot.telegram.sendMessage(adminId,`<b>${me.username} is checking unfollowers... </b>\nFollowings: ${me.followings.length}`,{parse_mode:"HTML"}).catch(()=>{})
        if(!me.followings || !me.followings.length || me.followings.length <= 10)return this.translate('nooneunfollowedyou').send();
        if(!me.active || !me.owner.active)return this.translate('nooneunfollowedyou').send();
        let profile:any = await igInstance.checkProfile(me.username)
        if(!profile || profile.is_private)return this.translate('nooneunfollowedyou').send();
        this.redis.set('checkunfollowers','c',{'EX':60*60*24})
        await this.translate('wearechecking').send()
        const job = checkerQueue.createJob({
            igId:me.igId,
            pk:this.pk
        });
        job.save();
    }
    async profile():Promise<User&{accounts:Account[]}>{
        let user = await prisma.user.findUnique({where:{id:this.pk},include:{accounts:{where:{main:true}}}})
        this.username = user?.accounts.length ? user?.accounts[0].username:undefined;
        
        return user!;
    }
    async account():Promise<Account&{owner:User,followings:Follow[]}>{
        let account = await prisma.account.findFirst({where:{user_id:this.pk,main:true},include:{owner:true,followings:true}})
        return account!;
    }
    async getUsername(){
        return this.username || (await this.account())?.username || "ghyathdarwish"
    }
    setLang(lang:string){
        this.lang = lang;
        this.redis.setProfileData(`locale`,lang);
    }
    async getLang(){
        let lang = await this.redis.getProfileData(`locale`) || 'en';
        this.lang = lang;
        return this.lang;
    }
    translate(key:string,vars={},lang = this.lang){
        const msg = this.i18n.__({phrase:key,locale:lang},vars)
        return {
            msg:msg!,
            send:(extra:ExtraReplyMessage={})=>{
                return this.sendMessage(msg!,extra);
            }
        }
    }
    sendMessage(msg: string,extra:ExtraReplyMessage={}){
        return bot.telegram.sendMessage(this.pk,msg,{...extra,parse_mode:"HTML"}).catch((e)=>{})
    }
    
    generateAccountLink(username: string){
        return `<a href='https://www.instagram.com/${username}'>@${username}</a>`
    }
    async getIGProfile(username = this.username){
        let user = JSON.parse(await this.redis.get('ig')||"{}")
        if(!user?.id){
            user = await igInstance.checkProfile(username) as any
            if(user){
                this.redis.set('ig',JSON.stringify({
                    id:user.id,
                    username:user.username,
                    profile_pic_url_hd:user?.profile_pic_url_hd,
                    edge_follow:{count:user?.edge_follow?.count},
                    edge_followed_by:{count:user?.edge_followed_by?.count},
                }),{'EX':60*30})
            }
        }
        let me = await this.profile()
        if(!user?.id){
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
        ).catch((e)=>{})
    }
    async register(msg: string,ctx:Context){
        let user = (await igInstance.checkProfile(msg) as any);
        if (!user?.id || user.is_private || user.is_verified) {
            return this.translate('usernamewrong').send();
        }
        let saved = await this.save(msg,user.id);
        this.redis.del('ig')
        if(saved.linked){
            return ctx.replyWithPhoto({ url: user.profile_pic_url_hd }, {
                parse_mode: "HTML",
                caption: `${this.generateAccountLink(user.username)} ${this.translate("accountUpdated").msg}`,
                ...this.keyboard.home()
            }).catch((e)=>{})
        }
        return this.sendMessage(saved.message!).catch((e)=>{});
    }
    async sendHomeMsg(){
        let username = await this.getUsername()
        if(username){
            return this.translate(`startfollow`).send(this.keyboard.home());
        }
        this.redis.set(`sendingusername`,'true',{"EX":60*60})
        return this.translate(`sendUrUsername`).send();
    }
    async accountSkipped():Promise<string[]>{
        return JSON.parse(await this.redis.get('skipped')||"[]");
    }
    async accountFollowed():Promise<string[]>{
        let profile = await this.account();
        return JSON.parse(await this.redis.get(`${profile.igId}:followed`)||"[]");
    }
    async addAccountToSkipped(username: string){
        let accounts = await this.accountSkipped();
        // if(accounts.length > 40){
        //     accounts.shift();
        // }
        accounts.push(username)
        this.redis.set('skipped',JSON.stringify(accounts),{"EX":60*60*24*1});
    }
    async sendUser(){
        let execludes = this.memory.get<string[]>('execludes') || [];
        let me = await this.account();
        if(!me){
            return this.sendHomeMsg()
        }
        const [accountsSkipped] = await Promise.all([
            this.accountSkipped(),
            // this.accountFollowed()
        ])
        let account = await prisma.account.findFirst({
            where:{
                main:true,
                owner:{
                    id:{not:this.pk},
                    gems:{gte:2},
                    active:true
                },                
                username:{notIn:[...execludes,...accountsSkipped]},
                active:true,
                followings:{
                    none:{
                        follower_id:{equals:me.igId}
                    }
                },
            },
            orderBy:{
                owner:{
                    gems:'desc'
                }
            }
        })
        if(!account)return this.translate('notusertofolw').send();
        // const user = await igInstance.checkProfile(account.igUsername) as any;
        // if(!user)return;
        bot.telegram.sendMessage(this.pk,`${this.translate('dofollow',{username:account.username}).msg}\n${this.translate('moregemsmorefollowers').msg}`,
        {
            ...this.keyboard.panel(account.username),
            parse_mode:"HTML",
        }
        ).catch((e)=>{})
    }
}
if(!isPausedWorker){
    queue.process(3,async (job)=> {
        const {username,password} = getCredentials();
        const ig = new IG(username,password);
        await ig.login()
        await IG.sleep(500,2000);
        job.retries(1);
        const isFollowed = await ig.checkIfollowed(job.data.usernameToFollow, job.data.followerIGId);
        const followerUsername = job.data.followerUsername;
        console.log(followerUsername,'following',job.data.usernameToFollow,'... Result:', isFollowed);
        return isFollowed;
    });

    queue.on('succeeded',async (job,result)=>{
        const followerPk = job.data.followerPk;
        const usernameToFollow = job.data.usernameToFollow;
        const followerUsername = job.data.followerUsername;
        const followerLang = job.data.followerLang;
        const follower = new Client(followerPk,followerLang);
        let fakefollows = parseInt(await follower.redis.get(`fakefollows`)||"0")
        if(!result){
            if(!fakefollows){
                await follower.redis.set('fakefollows',"0",{"EX":60*10})
            }
            follower.translate('notfollowed',{username:usernameToFollow}).send()
            follower.redis.client.incr(`${followerPk}:fakefollows`);
        }
        if(result){
            if(fakefollows>0){
                follower.redis.client.decr(`${followerPk}:fakefollows`);
            }
            const followedAccounts = await follower.followedAccounts();
            if(followedAccounts.includes(usernameToFollow))return;
            bot.telegram.sendMessage(followerPk,`${follower.translate('youvfollowed',{username:usernameToFollow}).msg}`,{...follower.keyboard.shareBot(),parse_mode:"HTML"}).catch((e)=>{})
            
            let otherUser = await follower.findUserByUsername(usernameToFollow);
            if(!otherUser)return;
            let oClient = await follower.saveFollowAction(otherUser.igId)
            let otherClient = new Client(otherUser.owner.id);
            let userLang = await otherClient.getLang();
            bot.telegram.sendMessage(otherUser.owner.id,`<b>${followerUsername}</b> ${otherClient.translate('followedyou',{gems:oClient.owner.gems},userLang).msg}`,{
                ...otherClient.keyboard.inlineKeyboard([{text:otherClient.translate('startfollowbtn').msg,callback_data:"sendusertofollow"}]),
                parse_mode:"HTML"}).catch((e)=>{});
        }
        
        follower.memory.shift('execludes',usernameToFollow);
    });

    checkerQueue.process(async (job)=>{
        let igId = job.data.igId;
        let pk = job.data.pk;
        let client = new Client(pk);
        let [followActions,usernames] = await Promise.all([
            client.getFollowers(igId),
            igInstance.getAllFollowers(igId)
        ])
        await IG.sleep(5000,8000);
        if(!usernames || !followActions.length)return;
        let allExpectedUsernames = followActions.map((action)=>action.follower.username).filter((a)=>a);
        let unfollowedme:string[] = [];
        allExpectedUsernames.map((one)=>{
            if(!usernames!.includes(one!)){
                unfollowedme.push(one!);          
            }
        })
        bot.telegram.sendMessage(adminId,`<b>Unfollowers: \n${unfollowedme.join('\n')}</b>`,{parse_mode:"HTML"}).catch(()=>{})
        followActions = followActions.filter((fa)=>fa.follower && unfollowedme.includes(fa.follower.username));
        return notifyUnfollowers(pk,followActions);
    })
}