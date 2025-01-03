'use strict';

/**
 * golfer service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::golfer.golfer');
