'use strict';

const lineBot = require('@line/bot-sdk');
const requestPromise = require('request-promise');
const aws = require('ibm-cos-sdk');
const dateFns = require('date-fns');

let botConfig;
let botClient;

exports.handler = function(context, event, callback) {
  botConfig = {
    channelAccessToken: context.LINE_BOT_ACCESS_TOKEN,
    channelSecret: context.LINE_BOT_CHANNEL_SECRET,
  };
  botClient = new lineBot.Client(botConfig);

  // TODO: HeaderのValidation

  const body = event;
  // console.log(`body=${JSON.stringify(body)}`);

  if (body === null) {
    throw new Error('body parsing failed');
  }

  body.events.forEach(async webhookData => {
    const replyToken = webhookData.replyToken;
    const msgEvtType = webhookData.type;
    const timeStamp = webhookData.timestamp;
    const userId = webhookData.source.userId;
    const messageId = webhookData.message.id;

    // 接続確認
    if (replyToken === '00000000000000000000000000000000') {
      console.log('Connection OK');
      return;
    }

    switch (msgEvtType) {
      case 'follow': // 友達追加時
        // TODO: 使い方を説明するメッセージを送信
        break;

      case 'message': {
        // メッセージ受信時
        const messageType = webhookData.message.type;
        switch (messageType) {
          case 'text': // テキストメッセージの場合
            botClient.replyMessage(replyToken, {
              type: 'text',
              text: 'textありがとう',
            });
            break;

          case 'image': {
            // 画像の場合
            botClient.pushMessage(userId, {
              type: 'text',
              text: 'image読込中',
            });
            const binImage = await getLineImage(messageId, replyToken);

            const cos = new aws.S3({
              endpoint: context.ICOS_ENDPOINT,
              apiKeyId: context.ICOS_API_KEY,
              ibmAuthEndpoint: 'https://iam.ng.bluemix.net/oidc/token',
              serviceInstanceId: context.ICOS_RESOURCE_ID,
            });

            const filename =
              dateFns.format(new Date(), 'yyyyMMddHHmmss') + '_grampus.jpeg';
            const imageUrl = `https://${context.ICOS_BUCKET_NAME}.${context.ICOS_ENDPOINT}/${filename}`;
            console.log(`url=${imageUrl}`);

            if (binImage) {
              await cos
                .putObject({
                  Bucket: context.ICOS_BUCKET_NAME,
                  Key: filename,
                  ContentType: 'image/jpeg',
                  ACL: 'public-read',
                  Body: binImage,
                })
                .promise();
            }
            break;
          }
        }
      }
    }
  });

  callback(null, { statusCode: 200 });
};

async function getLineImage(messageId, replyToken) {
  const options = {
    url: `https://api.line.me/v2/bot/message/${messageId}/content`,
    method: 'get',
    headers: {
      Authorization: 'Bearer ' + botConfig.channelAccessToken,
    },
    encoding: null,
  };
  let binImage;
  try {
    binImage = await requestPromise(options);
    await botClient.replyMessage(replyToken, {
      type: 'text',
      text: '画像取得に成功しました',
    });
  } catch (err) {
    console.log(`getLineImage: error=${err}`);
    await botClient.replyMessage(replyToken, {
      type: 'text',
      text: '画像取得に失敗しました',
    });
  }

  return binImage;
}
