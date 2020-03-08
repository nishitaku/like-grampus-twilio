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
            case 'text': // テキストメッセージの場合
              await botClient.replyMessage(replyToken, {
                type: 'text',
                text: 'textありがとう',
              });
              break;

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

                const classifyResult = await classifyImageByICVR(
                  context,
                  binImage
                );
                console.log(`classifyResult=${JSON.stringify(classifyResult)}`);
                const scoreStr = `${classifyResult.score * 100}%`;

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

async function classifyImageByICVR(context, img) {
  const vr = new VisualRecognitionV3({
    serviceUrl: 'https://api.us-south.visual-recognition.watson.cloud.ibm.com',
    version: '2018-03-19',
    authenticator: new IamAuthenticator({ apikey: context.ICVR_API_KEY }),
  });
  const params = {
    imagesFile: img,
    classifierIds: ['DefaultCustomModel_2123619983'],
    threshold: 0.0,
  };
  console.log(`classifyImageByICVR: START`);
  const response = await vr.classify(params);
  // console.log(
  //   `classifyImageByICVR: result=${JSON.stringify(response.result, null, 2)}`
  // );
  const classes = response.result.images[0].classifiers[0].classes;
  const highestScoreClass = classes.reduce((pre, cur) =>
    pre.score > cur.score ? pre : cur
  );
  // console.log(
  //   `classifyImageByICVR: highestScoreClass=${JSON.stringify(
  //     highestScoreClass
  //   )}`
  // );
  const playerInfo = PLAYER_INFOS.filter(
    player => player.class === highestScoreClass.class
  )[0];
  // console.log(`classifyImageByICVR: playerInfo=${JSON.stringify(playerInfo)}`);

  return Object.assign(playerInfo, highestScoreClass);
}

// TODO: DBから取得
const PLAYER_INFOS = [
  {
    class: 'abehiroyuki_11',
    playerName: '阿部浩之',
    position: 'MF',
    uniformNumber: '11',
    nickName: 'あべちゃん',
    birthday: '1989/7/5',
    from: '奈良県',
    height: 170,
    weight: 68,
    constellation: 'かに座',
    bloodType: 'A',
  },
  {
    class: 'akiyamayosuke_14',
    playerName: '秋山陽介',
    position: 'DF',
    uniformNumber: '14',
    nickName: 'アキ',
    birthday: '1995/4/13',
    from: '千葉県',
    height: 172,
    weight: 70,
    constellation: 'おひつじ座',
    bloodType: 'B',
  },
  {
    class: 'aokiryota_19',
    playerName: '青木亮太',
    position: 'MF',
    uniformNumber: '19',
    nickName: 'リョウタ',
    birthday: '1996/3/6',
    from: '東京都',
    height: 174,
    weight: 68,
    constellation: 'うお座',
    bloodType: 'A',
  },
  {
    class: 'ariajasuru_9',
    playerName: '長谷川アーリアジャスール',
    position: 'MF',
    uniformNumber: '9',
    nickName: 'アーリア',
    birthday: '1988/10/29',
    from: '埼玉県',
    height: 186,
    weight: 74,
    constellation: 'サソリ座',
    bloodType: 'B',
  },
  {
    class: 'chibakazuhiko_5',
    playerName: '千葉和彦',
    position: 'DF',
    uniformNumber: '5',
    nickName: 'ちばちゃん、バーチー',
    birthday: '1985/6/21',
    from: '北海道',
    height: 183,
    weight: 77,
    constellation: 'ふたご座',
    bloodType: 'B',
  },
  {
    class: 'fujiiharuya_13',
    playerName: '藤井陽也',
    position: 'DF',
    uniformNumber: '13',
    nickName: 'はる、はるちゃん',
    birthday: '2000/12/26',
    from: '愛知県春日井市',
    height: 187,
    weight: 76,
    constellation: 'やぎ座',
    bloodType: 'AB',
  },
  {
    class: 'inagakisyo_15',
    playerName: '稲垣祥',
    position: 'MF',
    uniformNumber: '15',
    nickName: 'しょう、ゴロー、ガッキー',
    birthday: '1991/12/25',
    from: '東京都',
    height: 175,
    weight: 70,
    constellation: 'やぎ座',
    bloodType: 'A',
  },
  {
    class: 'ishidaryotaro_24',
    playerName: '石田凌太郎',
    position: 'MF',
    uniformNumber: '24',
    nickName: 'りょうたろう',
    birthday: '2001/12/13',
    from: '名古屋市',
    height: 175,
    weight: 72,
    constellation: 'いて座',
    bloodType: 'O',
  },
  {
    class: 'jo_7',
    playerName: 'ジョー',
    position: 'FW',
    uniformNumber: '7',
    nickName: 'ジョー',
    birthday: '1987/3/20',
    from: 'ブラジル',
    height: 192,
    weight: 91,
    constellation: 'うお座',
    bloodType: '-',
  },
  {
    class: 'langerak_1',
    playerName: 'ランゲラック',
    position: 'GK',
    uniformNumber: '1',
    nickName: 'ミッチ',
    birthday: '1988/8/22',
    from: 'オーストラリア',
    height: 193,
    weight: 78,
    constellation: 'しし座',
    bloodType: '-',
  },
  {
    class: 'maedanaoki_25',
    playerName: '前田直輝',
    position: 'FW',
    uniformNumber: '25',
    nickName: 'まえちゃん、ナオキ',
    birthday: '1994/11/17',
    from: '埼玉県',
    height: 177,
    weight: 72,
    constellation: 'さそり座',
    bloodType: 'O',
  },
  {
    class: 'maruyamayuichi_3',
    playerName: '丸山祐市',
    position: 'DF',
    uniformNumber: '3',
    nickName: 'マル',
    birthday: '1989/6/16',
    from: '東京都',
    height: 182,
    weight: 75,
    constellation: 'ふたご座',
    bloodType: 'A',
  },
  {
    class: 'mateus_16',
    playerName: 'マテウス',
    position: 'FW',
    uniformNumber: '16',
    nickName: 'マテウス',
    birthday: '1994/9/11',
    from: 'ブラジル',
    height: 167,
    weight: 69,
    constellation: 'おとめ座',
    bloodType: '-',
  },
  {
    class: 'mitsuidaiki_22',
    playerName: '三井大輝',
    position: 'GK',
    uniformNumber: '22',
    nickName: 'みつい',
    birthday: '2001/5/27',
    from: '愛知県日進市',
    height: 189,
    weight: 80,
    constellation: 'ふたご座',
    bloodType: 'O',
  },
  {
    class: 'miyaharakazuya_6',
    playerName: '宮原和也',
    position: 'DF',
    uniformNumber: '6',
    nickName: 'カズヤ、カズくん',
    birthday: '1996/3/22',
    from: '広島県',
    height: 172,
    weight: 67,
    constellation: 'おひつじ座',
    bloodType: 'A',
  },
  {
    class: 'nakatanishinnosuke_4',
    playerName: '中谷進之介',
    position: 'DF',
    uniformNumber: '4',
    nickName: 'シン',
    birthday: '1996/3/24',
    from: '千葉県',
    height: 184,
    weight: 77,
    constellation: 'おひつじ座',
    bloodType: 'AB',
  },
  {
    class: 'narazakiseigo',
    playerName: '楢崎正剛',
    position: 'GK',
    uniformNumber: '-',
    nickName: 'ナラ',
    birthday: '1976/4/15',
    from: '奈良県',
    height: 187,
    weight: 80,
    constellation: 'おひつじ座',
    bloodType: 'AB',
  },
  {
    class: 'naruseshumpei_26',
    playerName: '成瀬竣平',
    position: 'DF',
    uniformNumber: 26,
    nickName: 'ナル',
    birthday: '2001/1/17',
    from: '愛知県瀬戸市',
    height: 166,
    weight: 63,
    constellation: 'やぎ座',
    bloodType: 'O',
  },
  {
    class: 'otakosuke_36',
    playerName: '太田宏介',
    position: 'DF',
    uniformNumber: 36,
    nickName: 'コースケ、こーちゃん',
    birthday: '1987/7/23',
    from: '東京都',
    height: 179,
    weight: 78,
    constellation: 'しし座',
    bloodType: 'A',
  },
  {
    class: 'shibuyatsubasa_18',
    playerName: '渋谷飛翔',
    position: 'GK',
    uniformNumber: 18,
    nickName: 'ツバサ',
    birthday: '1995/1/27',
    from: '東京都',
    height: 189,
    weight: 88,
    constellation: 'みずがめ座',
    bloodType: 'A',
  },
  {
    class: 'simicchi_8',
    playerName: 'ジョアン シミッチ',
    position: 'MF',
    uniformNumber: 8,
    nickName: 'ジョアン',
    birthday: '1993/5/19',
    from: 'ブラジル',
    height: 183,
    weight: 79,
    constellation: 'おうし座',
    bloodType: '-',
  },
  {
    class: 'somayuki_27',
    playerName: '相馬勇紀',
    position: 'FW',
    uniformNumber: 27,
    nickName: 'ソウマ、ドラミちゃん',
    birthday: '1997/2/25',
    from: '東京都',
    height: 166,
    weight: 63,
    constellation: 'うお座',
    bloodType: 'B',
  },
  {
    class: 'syabieru_10',
    playerName: 'シャビエル',
    position: 'FW',
    uniformNumber: 10,
    nickName: 'シャビエル、シャビ',
    birthday: '1993/7/15',
    from: 'ブラジル',
    height: 170,
    weight: 68,
    constellation: 'かに座',
    bloodType: '-',
  },
  {
    class: 'takedayohei_21',
    playerName: '武田洋平',
    position: 'GK',
    uniformNumber: 21,
    nickName: 'タケ、ヨウヘイ',
    birthday: '1987/6/30',
    from: '大阪府',
    height: 190,
    weight: 82,
    constellation: 'かに座',
    bloodType: 'A',
  },
  {
    class: 'takujiyonemoto_2',
    playerName: '米本拓司',
    position: 'MF',
    uniformNumber: 2,
    nickName: 'ヨネ',
    birthday: '1990/12/3',
    from: '兵庫県',
    height: 177,
    weight: 71,
    constellation: 'いて座',
    bloodType: 'O',
  },
  {
    class: 'watanabeshuto_20',
    playerName: '渡邉柊斗',
    position: 'MF',
    uniformNumber: 20,
    nickName: 'シュウト',
    birthday: '1997/1/28',
    from: '名古屋市瑞穂区',
    height: 168,
    weight: 60,
    constellation: 'いて座',
    bloodType: 'A',
  },
  {
    class: 'yamasakiryogo_17',
    playerName: '山﨑凌吾',
    position: 'FW',
    uniformNumber: 17,
    nickName: 'ヤマ',
    birthday: '1992/9/20',
    from: '岡山県',
    height: 187,
    weight: 82,
    constellation: 'おとめ座',
    bloodType: 'B',
  },
  {
    class: 'yoshidaakira_28',
    playerName: '吉田晃',
    position: 'DF',
    uniformNumber: 28,
    nickName: 'アッキー',
    birthday: '2001/7/9',
    from: '福岡県',
    height: 184,
    weight: 70,
    constellation: 'かに座',
    bloodType: 'A',
  },
  {
    class: 'yoshidayutaka_23',
    playerName: '吉田豊',
    position: 'DF',
    uniformNumber: 23,
    nickName: 'ユタカ',
    birthday: '1990/2/17',
    from: '静岡県',
    height: 168,
    weight: 72,
    constellation: 'みずがめ座',
    bloodType: 'AB',
  },
];
