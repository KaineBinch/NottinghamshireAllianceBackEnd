
'use strict';

module.exports = {
  routes: [
    {
      method: 'POST',
      path: '/scores/import-csv',
      handler: 'score.importScoresFromCSV',
      config: {
        auth: false,
        policies: [],

      },
    },
  ],
};