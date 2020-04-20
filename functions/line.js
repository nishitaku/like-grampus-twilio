'use strict';

const lineBot = require('@line/bot-sdk');
const requestPromise = require('request-promise');
const aws = require('ibm-cos-sdk');
const dateFns = require('date-fns');
const jimp = require('jimp');
const kintoneClient = require(Runtime.getFunctions().kintone.path);
const icvrClient = require(Runtime.getFunctions().icvr.path);

let botConfig;
let botClient;
let cos;

exports.handler = async function(context, event, callback) {
  try {
    botConfig = {
      channelAccessToken:
        context.LINE_BOT_ACCESS_TOKEN1 + context.LINE_BOT_ACCESS_TOKEN2,
      channelSecret: context.LINE_BOT_CHANNEL_SECRET,
    };
    botClient = new lineBot.Client(botConfig);

    // TODO: HeaderのValidation

    const body = event;
    console.log(`body=${JSON.stringify(body)}`);

    if (body === null) {
      throw new Error('body parsing failed');
    }
    const promises = body.events.map(async webhookData => {
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
            case 'text': {
              // テキストメッセージの場合

              // const records = await kintoneClient.getRecords();
              await kintoneClient.addRecord(context);
              await botClient.replyMessage(replyToken, {
                type: 'text',
                text: 'textありがとう',
              });
              break;
            }
            case 'image': {
              // 画像の場合
              await botClient.pushMessage(userId, {
                type: 'text',
                text: 'あなたにソックリな選手は・・・',
              });
              const binImage = await getLineImage(messageId, replyToken);

              if (binImage) {
                cos = new aws.S3({
                  endpoint: context.ICOS_ENDPOINT,
                  apiKeyId: context.ICOS_API_KEY,
                  ibmAuthEndpoint: 'https://iam.ng.bluemix.net/oidc/token',
                  serviceInstanceId: context.ICOS_RESOURCE_ID,
                });

                // const now = new Date();
                // const originalFilename =
                //   dateFns.format(now, 'yyyyMMddHHmmss') + '_grampus.jpeg';
                // const originalImageUrl = await putImageToICOS(
                //   context,
                //   originalFilename,
                //   binImage
                // );

                // const previewFilename =
                //   dateFns.format(now, 'yyyyMMddHHmmss') +
                //   '_preview_grampus.jpeg';
                // const jimpImage = await jimp.read(binImage);
                // const scaledImage = await jimpImage
                //   .scaleToFit(240, 240)
                //   .getBufferAsync(jimp.MIME_JPEG);
                // const previewImageUrl = await putImageToICOS(
                //   context,
                //   previewFilename,
                //   scaledImage
                // );

                // await botClient.replyMessage(replyToken, {
                //   type: 'image',
                //   originalContentUrl: originalImageUrl,
                //   previewImageUrl: previewImageUrl,
                // });
                const classifyResult = await icvrClient.classifyImage(
                  context,
                  binImage
                );
                console.log(`classifyResult=${JSON.stringify(classifyResult)}`);
                const scoreStr = `${(classifyResult.score * 100).toFixed(1)}%`;

                // 選手の画像を送信
                await botClient.pushMessage(userId, {
                  type: 'image',
                  originalContentUrl: getPlayerImagerUrl(
                    context,
                    classifyResult.class
                  ),
                  previewImageUrl: getPlayerImagerPreviewUrl(
                    context,
                    classifyResult.class
                  ),
                });

                // 選手のプロフィールを送信
                await botClient.replyMessage(replyToken, {
                  type: 'text',
                  text: `${classifyResult.playerName} 選手 \n\nソックリ度：${scoreStr}\n\n・ポジション：${classifyResult.position}\n・背番号：${classifyResult.uniformNumber}\n・ニックネーム：${classifyResult.nickName}\n・誕生日：${classifyResult.birthday}\n・出身：${classifyResult.from}\n・身長/体重：${classifyResult.height}/${classifyResult.weight}\n・星座：${classifyResult.constellation}\n・血液型：${classifyResult.bloodType}型`,
                });
              }
              break;
            }
          }
        }
      }
    });
    await Promise.all(promises);
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

function getPlayerImagerUrl(context, className) {
  return `https://${context.ICOS_BUCKET_NAME}.${context.ICOS_ENDPOINT}/${className}.jpg`;
}

function getPlayerImagerPreviewUrl(context, className) {
  return `https://${context.ICOS_BUCKET_NAME}.${context.ICOS_ENDPOINT}/${className}_preview.jpg`;
}
