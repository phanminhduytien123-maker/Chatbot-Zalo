import axios from 'axios';
import * as cheerio from 'cheerio';
import { tdtuAuth } from './auth.js';

async function testSSOData() {
  const loginRes = await tdtuAuth.login('42200522', 'DuyTienA123@');
  const ssoUrl = loginRes.redirectUrl;

  const client = axios.create({
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      'Cookie': loginRes.cookie
    },
    maxRedirects: 5
  });

  const ssoRes = await client.get(ssoUrl);
  console.log('SSO status:', ssoRes.status);
  console.log('SSO HTML Snippet:');
  console.log(ssoRes.data.substring(0, 1000));

  const $ = cheerio.load(ssoRes.data);
  $('form').each((i, el) => {
    console.log('SSO Form Action:', $(el).attr('action'), 'Method:', $(el).attr('method'));
    $(el).find('input').each((j, inp) => {
      console.log(' Input:', $(inp).attr('name'), 'value:', $(inp).attr('value'));
    });
  });

  $('script').each((i, el) => {
    console.log('SSO Script:', $(el).html());
  });
}

testSSOData();
