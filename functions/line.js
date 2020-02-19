const lineBot = require("@line/bot-sdk");

exports.handler = function(context, event, callback) {
  const botConfig = {
    channelAccessToken: context.LINE_BOT_ACCESS_TOKEN,
    channelSecret: context.LINE_BOT_CHANNEL_SECRET
  }
  const botClient = new lineBot.Client(botConfig);

  console.log(`bot called!!`);

  const  body = event;
  console.log(`body=${JSON.stringify(body)}`);

  if (body === null) {
    throw new Error('body parsing failed');
  }

  body.events.forEach(async (webhookData) => {
    const replyToken = webhookData.replyToken;
    const msgEvtType = webhookData.type;
    const timeStamp = webhookData.timestamp;
    const userId = webhookData.source.userId;

    switch (msgEvtType) {
      case 'message': // メッセージ送信時
      botClient.replyMessage(replyToken, {type: 'text', text: 'ありがとう'});
      break;
    }
  });

  callback(null, {statusCode: 200});
};
