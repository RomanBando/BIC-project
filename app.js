import fetch from 'node-fetch';
import fs from 'fs';
import AdmZip from 'adm-zip';
import iconv from 'iconv-lite';
import xml2js from 'xml2js';

const cbrUrl = 'http://www.cbr.ru/s/newbik';

async function downloadAndParseFile(url, destination) {
  try {
    // Download the file first
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Http Error: ${response.status} ${response.statusText}`);
    }

    const fileStream = fs.createWriteStream(destination);

    await new Promise((resolve, reject) => {
      response.body.pipe(fileStream);
      response.body.on('error', (err) => {
        reject(err);
      });
      fileStream.on('finish', function() {
        resolve();
      });
    });

    console.log(`File downloaded from ${url} and saved as ${destination}`);

    // Extract file from archive
    const zip = new AdmZip(destination);
    const extractPath = './from-zip';
    const xmlEntry = zip.getEntries()[0];
    const xmlFileName = 'new-file.xml';

    zip.extractAllTo(extractPath, /*overwrite*/ true);

    // Rename the file
    const oldFilePath = `${extractPath}/${xmlEntry.entryName}`;
    const newFilePath = `${extractPath}/${xmlFileName}`;

    fs.renameSync(oldFilePath, newFilePath);
    
    console.log(`File extracted to: ${extractPath}`);

    // Change encoding
    const xmlBuffer = fs.readFileSync(newFilePath);
    const decodedXml = iconv.decode(xmlBuffer, 'CP1251');

    // Parse the file
    const parseStringAsync = (xmlData) =>
      new Promise((resolve, reject) => {
        const parser = new xml2js.Parser({ explicitArray: true });
        parser.parseString(xmlData, (err, result) => {
          if (err) {
            reject(err);
          } else {
            resolve(result);
          }
        });
      });

    const parsedResult = await parseStringAsync(decodedXml);
    const bicEntries = parsedResult.ED807.BICDirectoryEntry;

    const extractedData = Array.isArray(bicEntries) ? bicEntries.flatMap(entry => {
      const bic = entry.$.BIC;
      const nameP = entry.ParticipantInfo;
      let accounts = entry.Accounts;

      if (!accounts) {
        return [];
      }

      if (!Array.isArray(accounts)) {
        accounts = [accounts];
      }

      return accounts.map(account => ({
        bic: bic,
        name: nameP[0].$.NameP,
        corrAccount: account.$.Account
      }));
    }) : [];

    return extractedData;
  }

  catch (error) {
    console.error(`Error while downloading file: ${error}`);
  }
}

downloadAndParseFile(cbrUrl, 'new-file.zip')
  .then((extractedData) => {
    console.log(extractedData);
  })