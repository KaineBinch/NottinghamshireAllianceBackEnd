'use strict';

const moment = require("moment");
const golfer = require("../../golfer/controllers/golfer");

const parse = (blob) => {
  console.log("blobby", blob)
  const lines = blob.split("\n")
  const results = []
  const expectedLength = lines[0].split(",").length
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    let row = line.split(",")
    while (row.length < expectedLength) row.push("")
    row = row.filter((v, i) => i == (expectedLength - 1) ? true : v.trim().length > 0)
    console.log(row)
    if (row.length != expectedLength) continue
    results.push(row)
  }
  return results
}

function formatDate(date) {
  let d = moment(date, "DD-MM-YYYY").toDate(),
    month = '' + (d.getMonth() + 1),
    day = '' + d.getDate(),
    year = d.getFullYear();

  if (month.length < 2)
    month = '0' + month;
  if (day.length < 2)
    day = '0' + day;

  return [year, month, day].join('-');
}

module.exports = {
  async importScoresFromCSV(ctx) {
    try {
      const unparsed = Symbol.for('unparsedBody')
      const body = JSON.parse(ctx.request.body[unparsed])

      const results = parse(body.blob);
      const createdEntries = [];
      const failedEntries = [];

      for (let i = 0; i < results.length; i++) {
        const row = results[i];

        if (row.length === 1 && row[0] === "") {
          console.log(`Row ${i} is completely empty. Skipping.`);
          continue;
        }

        try {
          const eventDate = formatDate(row[0])
          const golferTeeTime = row[1] + ".000"
          const golferName = row[2] || null;
          const isSenior = (row[3] || '').toLowerCase() === 'yes';
          const isPro = (row[4] || '').toLowerCase() === 'yes';
          const clubID = row[5] || null;
          const golferEventScore = parseInt(row[6], 10) || null;

          if (!eventDate || !golferTeeTime || !golferName || !clubID) {
            console.error(`Row ${i} is missing required data (Date, Time, Golfer Name, or Club Abbreviation). Skipping row.`);
            failedEntries.push({ row, error: `Missing required data.` });
            continue;
          }
          const clubDocumentId = await strapi.documents('api::golf-club.golf-club').findFirst({ where: { clubID } })

          const eventEntry = await strapi.documents('api::event.event').findFirst({ where: { eventDate } });
          if (!eventEntry) {
            console.error(`Event not found for date: ${eventDate}. Skipping row ${i}.`);
            failedEntries.push({ row, error: `Event not found for date: ${eventDate}` });
            continue;
          }

          let golferEntry = await strapi.documents('api::golfer.golfer').findFirst({
            where: { golferName, golf_club: clubDocumentId }, // Search by Name AND Club ID
          });

          if (!golferEntry) {
            golferEntry = await strapi.documents('api::golfer.golfer').create({
              data: {
                golferName,
                isSenior,
                isPro,
                golf_club: clubDocumentId
              },
              status: 'published',
            });
            if (!golferEntry) {
              console.error(`Failed to create golfer: ${golferName}. Skipping row ${i}.`);
              failedEntries.push({ row, error: `Failed to create golfer` });
              continue;
            }
          } else {
            console.log(`Golfer ${golferName} already exists at club ${clubID}. Using existing entry.`);
          }

          let teeTimeEntry = await strapi.documents('api::tee-time.tee-time').findFirst({
            populate: "*",
            filters: {
              $and: [
                {
                  event: {
                    documentId: eventEntry.documentId
                  }
                },
                { golferTeeTime },
              ]
            }
          });

          if (!teeTimeEntry) {
            teeTimeEntry = await strapi.documents('api::tee-time.tee-time').create({
              data: {
                golfers: [golferEntry.documentId],
                golferTeeTime,
                event: eventEntry.documentId,
              },
              status: 'published',
            });
          } else {
            const currentGolfers = teeTimeEntry.golfers
            teeTimeEntry = await strapi.documents('api::tee-time.tee-time').update({
              documentId: teeTimeEntry.documentId,
              data: {
                golfers: [...currentGolfers, golferEntry.documentId],
              },
              status: 'published',
            });
          }

          if (golferEventScore !== null) {
            const existingScore = await strapi.documents('api::score.score').findFirst({
              populate: "*",
              filters: {
                $and: [
                  {
                    event: {
                      documentId: eventEntry.documentId
                    }
                  },
                  { golfer: golferEntry.documentId },
                ]
              }
            });

            if (!existingScore) {
              const entry = await strapi.documents('api::score.score').create({
                data: {
                  golferEventScore,
                  golfer: golferEntry.documentId,
                  event: eventEntry.documentId,
                },
                status: 'published',
              });
              createdEntries.push(entry);
            } else {
              await strapi.documents('api::score.score').update({
                documentId: existingScore.documentId,
                data: {
                  golferEventScore,
                },
                status: 'published',
              });
              console.log(`Score already exists for Golfer: ${golferName} and Event: ${eventEntry.documentId}. Score updated`);
            }
          } else {
            console.log(`Row ${i} - No score provided. Tee Time entry checked/created.`);
          }

        } catch (error) {
          console.error(`Error processing row ${i}:`, error);
          failedEntries.push({ row, error: error.message });
        }
      }

      if (failedEntries.length > 0) {
        return ctx.badRequest('Some entries failed to import.', { failed: failedEntries, created: createdEntries.length, attempted: results.length });
      }

      ctx.send({ message: 'Data imported successfully!', created: createdEntries.length, attempted: results.length });
    } catch (error) {
      console.error("Outer Error:", error);
      ctx.throw(500, 'An unexpected error occurred: ' + error.message);
    }
  },
};