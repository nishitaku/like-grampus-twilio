'use strict';

const VisualRecognitionV3 = require('ibm-watson/visual-recognition/v3');
const { IamAuthenticator } = require('ibm-watson/auth');
const playerInfoMaster = require(Runtime.getFunctions()['player-info'].path);

async function classifyImage(context, img) {
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
  const response = await vr.classify(params);
  const classes = response.result.images[0].classifiers[0].classes;
  const highestScoreClass = classes.reduce((pre, cur) =>
    pre.score > cur.score ? pre : cur
  );

  // プレイヤー情報を取得
  const playerInfo = playerInfoMaster
    .getPlayerInfo()
    .filter(player => player.class === highestScoreClass.class)[0];

  return Object.assign(playerInfo, highestScoreClass);
}

module.exports = {
  classifyImage,
};
