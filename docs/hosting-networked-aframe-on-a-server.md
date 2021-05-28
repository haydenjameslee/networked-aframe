# How to Host Networked-Aframe on a Server

Once you've followed Networked-Aframe's [getting started guide](https://github.com/networked-aframe/networked-aframe/blob/master/docs/getting-started-local.md) and have a local instance of NAF the next step is to deploy your code to a server so you can share your experience over the internet.

There are many ways to host your experience, ranging from super simple but without much customization, to quite complex with lots of customization. This post will describe the various methods from simplest to most complex. The setup times listed are for people with no experience with the platform in question, ie. people with experience using AWS should be able to setup the server much quicker, however newbies will have a harder time.

Below the three example hosting services is extra information if you're using NAF with WebRTC. As always, if you find any errors with this post or run into any problems, please post a comment in the #networked-aframe channel of the [A-Frame Slack](https://aframe.io/slack-invite/) or reach out to me directly [on twitter](https://twitter.com/haydenlee37).


## Glitch.com (~5 minute setup time)

Cost: Free!

Custom domain: [Not yet](https://glitch.com/faq#domain)

Steps:
1. Sign up for a Glitch.com account (you can sign in with GitHub)
2. Open the [Networked-Aframe Glitch Starter Pack](https://glitch.com/~naf-project)
3. Click "Remix your own"

That's it! You can then click "Show" and you have a working example of NAF running at that URL. Open the URL in multiple tabs and you'll see the other avatars. If you're just in proof of concept phase I highly recommend you stop reading here and just use Glitch. It's also the defacto way the A-Frame community shares bugs and shows off examples, so its worth becoming familiar with it.


## Heroku (~2 hours setup time)

Cost: [Free tier](https://www.heroku.com/pricing)

Custom domain: Yes

Steps:
1. Sign up for a Heroku account
2. Follow the [hosting NodeJS on Heroku guide](https://devcenter.heroku.com/articles/getting-started-with-nodejs#introduction)
3. Repeat the guide's steps but for your own local Networked-Aframe instance ([created here](https://github.com/networked-aframe/networked-aframe/blob/master/docs/getting-started-local.md))


## Amazon Web Services (AWS) (~4 hours setup time)

Cost: [Free tier for new customers](https://aws.amazon.com/ec2/pricing/)

Custom domain: Yes

Steps:
1. Sign up for an AWS account
2. Follow the [hosting NodeJS on AWS guide](https://aws.amazon.com/getting-started/projects/deploy-nodejs-web-app/)
3. Make sure ports TCP 80 and TCP 443 (only if you're using SSL, see below) are open in the security group
3. Push your [local Networked-Aframe experience](https://github.com/networked-aframe/networked-aframe/blob/master/docs/getting-started-local.md) to a GitHub repo
4. Git clone your repo onto the AWS instance
5. Run `npm install pm2 -g` to install the pm2 process manager (this keeps your app alive even when you log off your server)
6. Start the app with `PORT=80 pm2 start server/easyrtc-server.js`


### Extra Steps for WebRTC

The above steps will work for the best cast network scenario, however the peer-to-peer nature of WebRTC introduces some problems when connecting to users on mobile networks and behind firewalls. To solve these issues WebRTC employs concepts such as [ICE, STUN and TURN servers](https://www.avaya.com/blogs/archives/2014/08/understanding-webrtc-media-connections-ice-stun-and-turn.html) to handle NAT punchthrough and make the initial connection between users in a room. Once the connection has been made no further actions are required.

Explaining how to setup your own STUN and TURN servers is beyond the scope of this guide, however it's easy to integrate third party services that handle STUN and TURN. The best service is Twilio's [Network Traversal Service](https://www.twilio.com/stun-turn) however I do not yet have experience setting this up with NAF (if you have integrated Twilio's TURN service with NAF I'd love to hear your of your experience). The service I have used is [XirSys](https://global.xirsys.net/dashboard/signup) which offers a free tier along with direct support for EasyRTC, the WebRTC library that powers Networked-Aframe.

To integrate XirSys into your hosted NAF instance follow these steps:
1. Sign up for the [XirSys free plan](https://global.xirsys.net/dashboard/signup)
2. Follow the [XirSys EasyRTC integration guide](https://github.com/xirsys/easyrtc/blob/master/docs/easyrtc_server_ice.md)
3. Implement the guide's steps into [server/easyrtc-server.js](https://github.com/networked-aframe/networked-aframe/blob/master/server/easyrtc-server.js)
4. Restart the NAF application


### WebRTC Audio requires a SSL Certificate

If your experience uses WebRTC audio functionality, you need to setup an SSL certificate for your domain name (so your domain uses https instead of http). This is neccessary because web browsers enforce a strict rule that in order to use WebRTC audio streaming your web page must be encrypted. This is to stop man-in-the-middle attacks from being able to take control of your computer's microphone or webcam.

To acchieve this one needs to insert:

    const https = require("https");
    const fs = require("fs");
    var privateKey  = fs.readFileSync('key.pem', 'utf8');
    var certificate = fs.readFileSync('cert.pem', 'utf8');
    var credentials = {key: privateKey, cert: certificate};

Add the keys, change the http references to https and start the server with the credentials:

    var webServer = https.createServer(credentials, app);



## Other Solutions

For other hosting solutions check out the [A-Frame Hosting Guide](https://aframe.io/docs/master/introduction/hosting-and-publishing.html).


### Author

Hayden Lee

[@HaydenLee37](https://twitter.com/haydenlee37)
