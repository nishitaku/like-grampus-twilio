'use strict';

const lineBot = require('@line/bot-sdk');
const requestPromise = require('request-promise');
const kintoneClient = require(Runtime.getFunctions().kintone.path);
const icvrClient = require(Runtime.getFunctions().icvr.path);
// const icosClient = require(Runtime.getFunctions().icos.path);

exports.handler = async function(context, event, callback) {
  try {
    const botConfig = {
      channelAccessToken:
        context.LINE_BOT_ACCESS_TOKEN1 + context.LINE_BOT_ACCESS_TOKEN2,
      channelSecret: context.LINE_BOT_CHANNEL_SECRET,
    };
    const botClient = new lineBot.Client(botConfig);

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
          const profile = await botClient.getProfile(userId);
          console.log(`profile=${JSON.stringify(profile)}`);
          const messageType = webhookData.message.type;
          switch (messageType) {
            case 'text': {
              // テキストメッセージの場合
              await botClient.replyMessage(replyToken, {
                type: 'text',
                text: 'textありがとう',
              });
              break;
            }
            case 'image': {
              // 画像の場合
              const binImage = await getLineImage(messageId, botConfig);

              if (binImage) {
                const classifyResult = await icvrClient.classifyImage(
                  context,
                  binImage
                );
                console.log(`classifyResult=${JSON.stringify(classifyResult)}`);

                // ユーザーDBに追加
                const userRecord = {
                  lineUserId: userId,
                  lineDisplayName: profile.displayName,
                  linePictureUrl: profile.pictureUrl,
                  lineUserLanguage: profile.language,
                };
                await kintoneClient.upsertUserAppRecord(context, userRecord);

                // 類似度判定DBに追加
                const classifiedAppRecord = {
                  lineUserId: userId,
                  className: classifyResult.class,
                  score: classifyResult.score,
                };
                await kintoneClient.addClassifiedAppRecord(
                  context,
                  classifiedAppRecord
                );

                const scoreStr = `${(classifyResult.score * 100).toFixed(1)}%`;

                await botClient.replyMessage(replyToken, [
                  {
                    type: 'text',
                    text: 'あなたにソックリな選手は・・・',
                  },
                  {
                    type: 'image',
                    originalContentUrl: getPlayerImagerUrl(
                      context,
                      classifyResult.class
                    ),
                    previewImageUrl: getPlayerImagerPreviewUrl(
                      context,
                      classifyResult.class
                    ),
                  },
                  {
                    type: 'text',
                    text: `${classifyResult.playerName} 選手 \n\nソックリ度：${scoreStr}\n\n・ポジション：${classifyResult.position}\n・背番号：${classifyResult.uniformNumber}\n・ニックネーム：${classifyResult.nickName}\n・誕生日：${classifyResult.birthday}\n・出身：${classifyResult.from}\n・身長/体重：${classifyResult.height}/${classifyResult.weight}\n・星座：${classifyResult.constellation}\n・血液型：${classifyResult.bloodType}型`,
                  },
                ]);
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

async function getLineImage(messageId, botConfig) {
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

function getPlayerImagerUrl(context, className) {
  return `https://${context.ICOS_BUCKET_NAME}.${context.ICOS_ENDPOINT}/${className}.jpg`;
}

function getPlayerImagerPreviewUrl(context, className) {
  return `https://${context.ICOS_BUCKET_NAME}.${context.ICOS_ENDPOINT}/${className}_preview.jpg`;
}
