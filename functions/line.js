'use strict';

const lineBot = require('@line/bot-sdk');
const requestPromise = require('request-promise');
const debug = require('debug')('grampus:line');
const kintoneClient = require(Runtime.getFunctions().kintone.path);
const icvrClient = require(Runtime.getFunctions().icvr.path);
const icosClient = require(Runtime.getFunctions().icos.path);
const crypto = require('crypto');

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
    debug(`body=${JSON.stringify(body)}`);

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
      if (
        replyToken === '00000000000000000000000000000000' ||
        replyToken === 'ffffffffffffffffffffffffffffffff'
      ) {
        debug('Connection OK');
        return;
      }

      let replyMessage;

      if (msgEvtType === 'message') {
        // メッセージ受信時
        const profile = await botClient.getProfile(userId);
        debug(`profile=${JSON.stringify(profile)}`);

        const messageType = webhookData.message.type;
        switch (messageType) {
          case 'text': {
            // テキストメッセージの場合
            replyMessage = {
              type: 'text',
              text: 'textありがとう',
            };
            break;
          }

          case 'image': {
            // 画像の場合
            const binImage = await getLineImage(messageId, botConfig);

            if (binImage) {
              // 画像を判定
              const classifyResult = await icvrClient.classifyImage(
                context,
                binImage
              );
              debug(`classifyResult=${JSON.stringify(classifyResult)}`);

              // 画像をICOSに保存
              const filename = createICOSImageName(userId);
              const imageUrl = await icosClient.putImage(
                context,
                filename,
                binImage
              );

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
                imageUrl,
              };
              await kintoneClient.addClassifiedAppRecord(
                context,
                classifiedAppRecord
              );

              const scoreStr = `${(classifyResult.score * 100).toFixed(1)} 点`;

              replyMessage = [
                {
                  type: 'text',
                  text: 'あなたにそっくりな選手は・・・',
                },
                createFlexMessage(
                  getPlayerImagerUrl(context, classifyResult.class),
                  classifyResult,
                  scoreStr
                ),
              ];
            }
            break;
          }
        }
      }
      if (replyMessage) {
        return botClient.replyMessage(replyToken, replyMessage);
      }
    });

    await Promise.all(promises);
  } catch (error) {
    debug(error);
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
  return `https://${context.ICOS_PLAYER_BUCKET_NAME}.${context.ICOS_ENDPOINT}/${className}.jpg`;
}

function getPlayerImagerPreviewUrl(context, className) {
  return `https://${context.ICOS_PLAYER_BUCKET_NAME}.${context.ICOS_ENDPOINT}/${className}_preview.jpg`;
}

function createICOSImageName(userId) {
  // ランダムな文字列からファイル名を生成する
  const length = 30;
  const randomStr = crypto
    .randomBytes(length)
    .toString('hex')
    .substring(0, length);
  return `${randomStr}.jpg`;
}

function createFlexMessage(playerImageUrl, classifyResult, scoreStr) {
  return {
    type: 'flex',
    altText: 'This is a Flex Message',
    contents: {
      type: 'bubble',
      hero: {
        type: 'image',
        url: playerImageUrl,
        size: 'full',
        aspectRatio: '20:13',
        aspectMode: 'cover',
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          {
            type: 'text',
            text: `${classifyResult.playerName} 選手`,
            wrap: true,
            weight: 'bold',
            gravity: 'center',
            size: 'xl',
          },
          {
            type: 'box',
            layout: 'baseline',
            contents: [
              {
                type: 'text',
                text: 'そっくりスコア',
                flex: 1,
              },
              {
                type: 'text',
                text: scoreStr,
                flex: 1,
              },
            ],
            spacing: 'sm',
          },
          {
            type: 'box',
            layout: 'vertical',
            margin: 'lg',
            spacing: 'sm',
            contents: [
              {
                type: 'box',
                layout: 'baseline',
                spacing: 'sm',
                contents: [
                  {
                    type: 'text',
                    text: 'ポジション',
                    color: '#aaaaaa',
                    size: 'sm',
                    flex: 1,
                  },
                  {
                    type: 'text',
                    text: classifyResult.position,
                    wrap: true,
                    size: 'sm',
                    color: '#666666',
                    flex: 1,
                  },
                ],
              },
              {
                type: 'box',
                layout: 'baseline',
                spacing: 'sm',
                contents: [
                  {
                    type: 'text',
                    text: '背番号',
                    color: '#aaaaaa',
                    size: 'sm',
                    flex: 1,
                  },
                  {
                    type: 'text',
                    text: classifyResult.uniformNumber,
                    wrap: true,
                    color: '#666666',
                    size: 'sm',
                    flex: 1,
                  },
                ],
              },
              {
                type: 'box',
                layout: 'baseline',
                spacing: 'sm',
                contents: [
                  {
                    type: 'text',
                    text: 'ニックネーム',
                    color: '#aaaaaa',
                    size: 'sm',
                    flex: 1,
                  },
                  {
                    type: 'text',
                    text: classifyResult.nickName,
                    wrap: true,
                    color: '#666666',
                    size: 'sm',
                    flex: 1,
                  },
                ],
              },
              {
                type: 'box',
                layout: 'baseline',
                spacing: 'sm',
                contents: [
                  {
                    type: 'text',
                    text: '誕生日',
                    color: '#aaaaaa',
                    size: 'sm',
                    flex: 1,
                  },
                  {
                    type: 'text',
                    text: classifyResult.birthday,
                    wrap: true,
                    color: '#666666',
                    size: 'sm',
                    flex: 1,
                  },
                ],
              },
              {
                type: 'box',
                layout: 'baseline',
                spacing: 'sm',
                contents: [
                  {
                    type: 'text',
                    text: '出身',
                    color: '#aaaaaa',
                    size: 'sm',
                    flex: 1,
                  },
                  {
                    type: 'text',
                    text: classifyResult.from,
                    wrap: true,
                    color: '#666666',
                    size: 'sm',
                    flex: 1,
                  },
                ],
              },
              {
                type: 'box',
                layout: 'baseline',
                spacing: 'sm',
                contents: [
                  {
                    type: 'text',
                    text: '身長/体重',
                    color: '#aaaaaa',
                    size: 'sm',
                    flex: 1,
                  },
                  {
                    type: 'text',
                    text: `${classifyResult.height}/${classifyResult.weight}`,
                    wrap: true,
                    color: '#666666',
                    size: 'sm',
                    flex: 1,
                  },
                ],
              },
              {
                type: 'box',
                layout: 'baseline',
                spacing: 'sm',
                contents: [
                  {
                    type: 'text',
                    text: '星座',
                    color: '#aaaaaa',
                    size: 'sm',
                    flex: 1,
                  },
                  {
                    type: 'text',
                    text: classifyResult.constellation,
                    wrap: true,
                    color: '#666666',
                    size: 'sm',
                    flex: 1,
                  },
                ],
              },
              {
                type: 'box',
                layout: 'baseline',
                spacing: 'sm',
                contents: [
                  {
                    type: 'text',
                    text: '血液型',
                    color: '#aaaaaa',
                    size: 'sm',
                    flex: 1,
                  },
                  {
                    type: 'text',
                    text: classifyResult.bloodType,
                    wrap: true,
                    color: '#666666',
                    size: 'sm',
                    flex: 1,
                  },
                ],
              },
            ],
          },
        ],
      },
    },
  };
}
