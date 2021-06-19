/* Modules */
const { email, pass, site } = require('./credentials'); // Import Google Search Credentials - EDIT CREDENTIALS.JS
const { readFile, writeFile } = require('fs/promises'); // Module to access the File System - Extract only ones needed
const { firefox } = require('playwright'); // Choose browser - Currently firefox but you can choose 'chromium' or 'webkit'.
const { parse } = require('json2csv'); // Convert JSON to CSV

/* Settings */
const property = 'https://search.google.com/search-console?resource_id=';
const resource = encodeURIComponent(site); // Encode it to create the correct URL
const file = './urls.csv'; // List of URLs to check from site
const makeHeadless = true; // Change to false if you want to see the browser in action

/* Data */
const getUrls = async () => {
  const rawFile = await readFile(file, 'utf8'); // Read urls.csv file
  const urls = rawFile.split('\n'); // Create array with URLs
  console.log(`Checking ${urls.length} urls`); // Log number of URLs
  return urls;
};
const results = []; // Empty holding array to push results

// Asynchronous IIFE - Immeditaly invoked function expression
(async () => {
  // Setup browser
  const browser = await firefox.launch({ headless: makeHeadless }); // Switch headless to false if you want to see the broswer automation
  const context = await browser.newContext();
  console.log('Starting headless browser');

  // Setup New Page
  let page = await context.newPage();

  // Set new default timeout for the page
  page.setDefaultTimeout(240000);
  await page.goto('https://search.google.com/search-console/welcome');

  // Find and submit Email input
  console.log('Inputing email...');
  await page.type('css=input', email, { delay: 50 });
  await page.keyboard.press('Enter');

  // Find and submit Password input
  console.log('Inputing password...');
  await page.waitForSelector('[name=password]');
  await page.type('[name=password]', pass, { delay: 50 });
  await page.keyboard.press('Enter');

  // Detect if there is 2-factor authentication
  try {
    await page.waitForSelector('text="2-step Verification"', {
      timeout: 3000,
    });
    console.log(
      'You have 2-step Verification enabled. Check your device to pass to the next step. The script will only wait for 30 seconds'
    );
    // Timeout of 10 seconds so the user can read the log message + 30secs automatic for the next selector
    await page.waitForTimeout(10000);
  } catch (e) {
    console.log(
      'No 2-step Verification was detected. Accessing Search Console...'
    );
  }

  // Try/Catch block in case the 2-factor auth fails or times out
  try {
    // Get URLs from file
    const urls = await getUrls();

    // Wait until navigating to GSC property
    await page.waitForSelector('text="Welcome to Google Search Console"');

    // Loop through the URLs
    for (const [index, url] of urls.entries()) {
      // Access GSC property
      await page.goto(property + resource);

      // Click on Search Box
      await page.waitForSelector('xpath=//*[@aria-label="Search"]');
      await page.waitForTimeout(1000);

      // Click & Type URL in Inspection bar
      await page.click('form[role=search]');
      await page.type('input[dir=ltr]', url, { delay: 5 });

      // Allow some time to check if quota is exceeded
      await page.waitForTimeout(1000);

      // Check if the daily quota has been exceeded
      if (await page.$('text=Quota exceeded')) {
        // Log Quota exceeded message
        console.log(
          'Quota exceeded, sorry come back tomorrow. Alternatively, you can use the Google Index Checker Script https://github.com/alvaro-escalante/google-index-checker to check more URLs.'
        );

        // Give some time to get the screenshot and take a screenshot
        await page.waitForTimeout(1000);
        await page.screenshot({
          path: 'quota-exc.png',
          fullPage: true,
        });
        break;
      } else {
        // Check if there is an error message
        if (await page.$('text=Something went wrong')) {
          console.log(
            'Something went wrong within GSC. The script will try to continue. If you see this message multiple times stop the script.'
          );
          continue;
        }
        // Check it the URL is in the property
        if (await page.$('text=URL not in property')) {
          console.log(
            `URL #${index + 1} ${url.replace(
              '\r',
              ''
            )} is not in this GSC property`
          );
          continue;
        }
        // Log Inspected URL
        console.log(`Retrieving #${index + 1} ${url}`);
        await page.click('[aria-label=Search]');

        // Wait to find the infromation selector
        await page.waitForSelector('.CC5fre');

        // Object to store URL indexing info
        const obj = {};

        // Make sure that URL doesn't have break lines if so remove them
        obj.url = url.replace('\r', '');

        // Extract coverage info & add to results obj
        obj.coverage = await page.evaluate(
          () => document.querySelector('.OJb48e').textContent
        );

        // Extract top level info and push to obj
        obj['index state'] = await page.$eval(
          '.CC5fre',
          (el) => el.textContent
        );
        console.log(obj['index state']);

        // Extract top level info description & add to results obj
        obj['index state description'] = await page.$eval(
          '.iMB8w',
          (el) => el.textContent
        );

        // Click Extract accordion values & add to results obj
        await page.click('.QB1Nub');
        obj['last crawl'] = await page.evaluate(
          () => document.querySelector('.zVF5Ie').textContent
        );

        // Other info Extraction & add to results obj
        const extraInfo = await page.evaluate(() => {
          const info = Array.from(document.querySelectorAll('.bakgf'));
          const infoArr = info.map(({ innerText }) => innerText.split(/\n/));
          return infoArr;
        });
        // Create new objet
        const extraInfoObj = {
          Sitemaps: extraInfo[0].toString(),
          'Referring page':
            extraInfo[1].length > 1 ? extraInfo[1] : extraInfo[1].toString(),
          'User-canonical': extraInfo[2].toString(),
          'Google-canonical':
            extraInfo[3][0] === 'Inspected URL'
              ? url.replace('\r', '')
              : extraInfo[3].toString(),
        };
        // Create final object with all the info
        finalObj = { ...obj, ...extraInfoObj }; // Using spread operator. Same as Object.assign()
        results.push(finalObj); // Push it to the results array

        // Write JSON results to file
        writeFile('./results.json', JSON.stringify(results, null, 2));
        // Parse JSON to CSV
        writeFile('./results.csv', parse(results)); //// Parse JSON results to CSV & write file
      }
    }
    // Close Browser
    await browser.close();
  } catch (error) {
    console.log(`There was an error running the script: ${error}`);
    process.exit();
  }
})();
