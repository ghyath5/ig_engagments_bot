import { Account, User } from ".prisma/client";
import { Client } from "./client";

export const notifyUnfollowers = async (pk:number,users:(Account & {follower: User})[])=>{
    let user = new Client(pk);
    let username = await user.getUsername()
    let i = 0;
    function sendNotification(){
        let timeoutcounter = setTimeout(async ()=>{
            if(i >= users.length){
                user.addGems(users.length);
                clearTimeout(timeoutcounter);
                return user.translate('yougotgems',{gems:users.length-2})
            }
            let client = new Client(users[i].follower.id);
            await client.getLang();
            await client.translate('detectUnfollow',{name:username}).send()
            console.log(`Sending ${i+1}/${users.length}`);
            client.deductGems(1);
            i++;
            sendNotification();
        },500)
    }
    sendNotification()
}

export const multipleNotification = async (msg:string,ids:number[]|string[])=>{

}