import { IgApiClientRealtime, withRealtime,GraphQLSubscriptions,SkywalkerSubscriptions, IgApiClientExt } from 'instagram_mqtt';
import { promises as fs } from "fs";
const ig: IgApiClientRealtime = withRealtime(new IgApiClientExt(), /* you may pass mixins in here */);
async function login(username: string,password: string){
    ig.state.generateDevice(username)
    const userId = await loadSession(username)
    if(!userId){
        try{
            await ig.simulate.preLoginFlow();
            let me = await ig.account.login(username,password);
            saveSession(username);
            await ig.simulate.postLoginFlow();
            return me;
        }catch(e){
            console.log("IG error login:", e)
            return false;
        }
    }
    saveSession(username);
    return userId;
}
function saveSession(username) {
    ig.request.end$.subscribe(async () => {
        const serialized = await ig.state.serialize();
        delete serialized.constants;
        fs.writeFile(`./sessions/${username}.json`, JSON.stringify(serialized), "utf-8")
    });
}
async function loadSession(username){
    try {
        const sessionFile = await fs.readFile(`./sessions/${username}.json`, "utf-8");
        await ig.state.deserialize(sessionFile);
        const userId =  ig.state.cookieUserId;
        return userId;
    } catch (e) {            
        console.log("IG error loadSession:", e)
        return false
    }
}

(async () => {
    
    await login('super_ig_engagement','aHmAd_tRaWi')
    // now `ig` is a client with a valid session

    // whenever something gets sent and has no event, this is called
    // ig.realtime.on('receive', (topic, messages) => console.log('receive', topic, messages));

    // this is called with a wrapper use {message} to only get the "actual" message from the wrapper

    ig.realtime.on('message', async (data)=>{
        // console.log(data.message);
        console.log(data.message);
        if(!data.message.user_id || data.message.user_id == 6449029088)return;
        const thread = ig.entity.directThread([data.message.user_id?.toString()]);
        await thread.broadcastText('Message from node');
        
    });
    
    // a thread is updated, e.g. admins/members added/removed
    // ig.realtime.on('threadUpdate', logEvent('threadUpdateWrapper'));

    // other direct messages - no messages
    // ig.realtime.on('direct', (data)=>{
    //     console.log(data.path);
        
    // });

    // whenever something gets sent to /ig_realtime_sub and has no event, this is called
    // ig.realtime.on('realtimeSub', logEvent('realtimeSub'));

    // whenever the client has a fatal error
    ig.realtime.on('error',(error)=>{
        console.log(error.message);
    });

    ig.realtime.on('close', () => console.error('RealtimeClient closed'));

    // connect
    // this will resolve once all initial subscriptions have been sent
    await ig.realtime.connect({
        // optional
        // graphQlSubs: [
        //     // these are some subscriptions
        //     GraphQLSubscriptions.getAppPresenceSubscription(),
        //     GraphQLSubscriptions.getZeroProvisionSubscription(ig.state.phoneId),
        //     GraphQLSubscriptions.getDirectStatusSubscription(),
        //     GraphQLSubscriptions.getDirectTypingSubscription(ig.state.cookieUserId),
        //     GraphQLSubscriptions.getAsyncAdSubscription(ig.state.cookieUserId),
        // ],
        // optional
        skywalkerSubs: [
            SkywalkerSubscriptions.directSub(ig.state.cookieUserId),
            // SkywalkerSubscriptions.liveSub(ig.state.cookieUserId),
        ],
        // optional
        // this enables you to get direct messages
        irisData: await ig.feed.directInbox().request(),
        // optional
        // in here you can change connect options
        // available are all properties defined in MQTToTConnectionClientInfo
        connectOverrides: {},
    });

    // simulate turning the device off after 2s and turning it back on after another 2s
    setTimeout(() => {
        console.log('Device off');
        // from now on, you won't receive any realtime-data as you "aren't in the app"
        // the keepAliveTimeout is somehow a 'constant' by instagram
        ig.realtime.direct.sendForegroundState({
            inForegroundApp: false,
            inForegroundDevice: false,
            keepAliveTimeout: 900,
        });
    }, 2000);
    setTimeout(() => {
        console.log('In App');
        ig.realtime.direct.sendForegroundState({
            inForegroundApp: true,
            inForegroundDevice: true,
            keepAliveTimeout: 60,
        });
    }, 4000);

    // an example on how to subscribe to live comments
    // you can add other GraphQL subs using .subscribe
    await ig.realtime.graphQlSubscribe(GraphQLSubscriptions.getLiveRealtimeCommentsSubscription('<broadcast-id>'));
})();

/**
 * A wrapper function to log to the console
 * @param name
 * @returns {(data) => void}
 */
function logEvent(name: string) {
    return (data: any) => console.log(name, data);
}