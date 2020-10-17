const https = require("https");
const webhook = require("webhook-discord");
const config = require("./config.json");

if(config.apiKey.length != 24) {
    console.log("Invalid API Key");
    return;
}

const options = {
    hostname: 'api.bestbuy.com',
    port: 443,
    path: `/v1/products((${config.searchText})&salePrice<=${config.maxSalePrice})?apiKey=${config.apiKey}&sort=sku.asc&show=sku,name,onlineAvailability,salePrice,url,addToCartUrl&pageSize=${config.pageSize}&format=json`,
    method: 'GET',
    headers: {
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9",
        "accept-encoding": "gzip, deflate, br",
        "accept-language": "en-US,en;q=0.9",
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "sec-fetch-site": "none",
        "sec-fetch-user": "?1",
        "upgrade-insecure-requests": 1,
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.121 Safari/537.3"
    },
    timeout: 3000
};

var previousData = undefined;
var exit = false;

const Hook = config.webhookURL.length > 0 ? new webhook.Webhook(config.webhookURL) : undefined;

function getProductFromData(sku, data) {
    if (data == undefined) return undefined;
    else for (var i = 0; i < data.products.length; i++) {
        const product = data.products[i];
        if (product != undefined && product.sku == sku) return product;
    }
    return undefined;
}

function sendNotifcations(product) {
    if (Hook != undefined) {
        var discord_text = "";
        if (product.onlineAvailability) {
            discord_text = `-- SHOWING IN STOCK --\n${product.name}\n${product.url}\n${product.addToCartUrl}\n-- SHOWING IN STOCK --`;
        } else {
            discord_text = `-- SHOWING OUT OF STOCK --\n${product.name}\n${product.url}\n-- SHOWING OUT OF STOCK --`;
        }
        const msg = new webhook.MessageBuilder()
            .setName("BestBuy Stock Bot")
            .setText(discord_text);
        Hook.send(msg);
    }
}

async function makeRequest() {
    console.log("Starting request...");
    return new Promise((resolve, reject) => {
        const req = https.request(options, res => {
            console.log("Received response!");
            console.log(`statusCode: ${res.statusCode}`);
            if (res.statusCode === 200) {
                res.on('data', d => {
                    try {
                        const data = JSON.parse(d);
                        if (data.total === 0) {
                            console.log('No products found');
                            exit = true;
                            resolve();
                        }
                        console.log(`Found ${data.total} items using search text "${config.searchText}"`);
                        for (var i = 0; i < data.products.length; i++) {
                            const product = data.products[i];
                            if (product == undefined) continue;
                            const previousProductData = getProductFromData(product.sku, previousData);
                            const product_string = `${product.sku} : ${product.name}($${product.salePrice})`;
                            console.log(product_string + (product.onlineAvailability ? " is in stock!" : " is not in stock"));
                            if (previousProductData != undefined && product.onlineAvailability != previousProductData.onlineAvailability) {
                                console.log("Change detected!");
                                sendNotifcations(product);
                            }
                            //else console.log("No changes...");
                        }
                        previousData = data;
                        resolve();
                    }
                    catch (error) {
                        console.log("Error: ", error);
                        resolve();
                    }
                });
            }
            else if (res.statusCode == 403) {
                exit = true;
                console.log(res.statusMessage);
                resolve();
            }
            else {
                resolve();
            }
        });

        req.on('error', error => {
            console.error(error);
            exit = true;
            resolve();
        });

        req.end();
    });
}

async function startRequestLoop() {
    while (!exit) {
        await makeRequest();
        await new Promise(r => setTimeout(r, config.requestInterval));
    }
}

startRequestLoop();

