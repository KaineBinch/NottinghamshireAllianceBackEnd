'use strict';

/**
 * tee-time router
 */

const { createCoreRouter } = require('@strapi/strapi').factories;

module.exports = createCoreRouter('api::tee-time.tee-time');
