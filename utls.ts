import { Account, PrismaClient, User } from ".prisma/client";
import { Client } from "./client";
const prisma = new PrismaClient()
export const notifyUnfollowers = async (pk:number,users:(Account & {follower: User})[])=>{
    let user = new Client(pk);
    let username = await user.getUsername()
    let i = 0;
    function sendNotification(){
        let timeoutcounter = setTimeout(async ()=>{
            if(i >= users.length){
                clearTimeout(timeoutcounter);
                user.deductGems(4);
                return user.translate('yougotgems',{gems:(users.length)-4}).send()
            }
            let active = users[i];
            let client = new Client(active.follower.id);
            console.log(`Sending ${i+1}/${users.length}`);
            prisma.account.delete({
                where:{
                    followed_id_follower_id:{
                        followed_id:active.followed_id,
                        follower_id:active.follower_id,
                    }
                },
                include:{
                    follower:true
                }
            }).then(async(a)=>{
                client.deductGems(1);
                await client.getLang();
                await client.translate('detectUnfollow',{name:username}).send()
                user.addGems(1);
                return user.translate('getgemsczunfollower',{username:a.follower.igUsername}).send()
            })
            i++;
            sendNotification();
        },800)
    }
    sendNotification()
}

export const multipleNotification = async (msgKey:string,ids:number[]|string[])=>{
    let i = 0;
    function sendNotification(){
        let timeoutcounter = setTimeout(async ()=>{
            if(i >= ids.length){
                return clearTimeout(timeoutcounter);
            }
            let active = ids[i];
            let client = new Client(Number(active));
            console.log(`Sending ${i+1}/${ids.length}`);
            await client.getLang()
            await client.translate(msgKey).send();
            i++;
            sendNotification();
        },500)
    }
    sendNotification()
}