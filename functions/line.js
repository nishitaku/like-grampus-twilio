'use strict';

const lineBot = require('@line/bot-sdk');
const requestPromise = require('request-promise');
const aws = require('ibm-cos-sdk');
const dateFns = require('date-fns');
const jimp = require('jimp');
const VisualRecognitionV3 = require('ibm-watson/visual-recognition/v3');
const { IamAuthenticator } = require('ibm-watson/auth');

let botConfig;
let botClient;
let cos;

exports.handler = function(context, event, callback) {
  botConfig = {
    channelAccessToken:
      context.LINE_BOT_ACCESS_TOKEN1 + context.LINE_BOT_ACCESS_TOKEN2,
    channelSecret: context.LINE_BOT_CHANNEL_SECRET,
  };
  botClient = new lineBot.Client(botConfig);

  // TODO: HeaderのValidation

  const body = event;
  // console.log(`body=${JSON.stringify(body)}`);

  if (body === null) {
    throw new Error('body parsing failed');
  }

  try {
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

              if (binImage) {
                cos = new aws.S3({
                  endpoint: context.ICOS_ENDPOINT,
                  apiKeyId: context.ICOS_API_KEY,
                  ibmAuthEndpoint: 'https://iam.ng.bluemix.net/oidc/token',
                  serviceInstanceId: context.ICOS_RESOURCE_ID,
                });

                const now = new Date();
                const originalFilename =
                  dateFns.format(now, 'yyyyMMddHHmmss') + '_grampus.jpeg';
                const originalImageUrl = await putImageToICOS(
                  context,
                  originalFilename,
                  binImage
                );

                const previewFilename =
                  dateFns.format(now, 'yyyyMMddHHmmss') +
                  '_preview_grampus.jpeg';
                const jimpImage = await jimp.read(binImage);
                const scaledImage = await jimpImage
                  .scaleToFit(240, 240)
                  .getBufferAsync(jimp.MIME_JPEG);
                const previewImageUrl = await putImageToICOS(
                  context,
                  previewFilename,
                  scaledImage
                );

                await botClient.replyMessage(replyToken, {
                  type: 'image',
                  originalContentUrl: originalImageUrl,
                  previewImageUrl: previewImageUrl,
                });

                await classifyImageByICVR(context, binImage);
              }
              break;
            }
          }
        }
      }
    });
  } catch (error) {
    console.log(error);
  }

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
  const binImage = await requestPromise(options);
  return binImage;
}

async function putImageToICOS(context, filename, img) {
  const imageUrl = `https://${context.ICOS_BUCKET_NAME}.${context.ICOS_ENDPOINT}/${filename}`;
  console.log(`url=${imageUrl}`);
  await cos
    .putObject({
      Bucket: context.ICOS_BUCKET_NAME,
      Key: filename,
      ContentType: 'image/jpeg',
      ACL: 'public-read',
      Body: img,
    })
    .promise();
  return imageUrl;
}

async function classifyImageByICVR(context, img) {
  const vr = new VisualRecognitionV3({
    serviceUrl: 'https://api.us-south.visual-recognition.watson.cloud.ibm.com',
    version: '2018-03-19',
    authenticator: new IamAuthenticator({ apikey: context.ICVR_API_KEY }),
  });
  const params = {
    imagesFile: img,
    classifierIds: ['part2_1832529296'],
    threshold: 0.6,
  };
  console.log(`classifyImageByICVR: START`);
  const response = await vr.classify(params);
  console.log(
    `classifyImageByICVR: result=${JSON.stringify(response.result, null, 2)}`
  );
}
