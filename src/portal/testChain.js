import axios from 'axios';
import { tdtuAuth } from './auth.js';

async function testRedirectChainDetailed() {
  const loginRes = await tdtuAuth.login('42200522', 'DuyTienA123@');
  const ssoUrl = loginRes.redirectUrl;

  let currentCookie = loginRes.cookie;
  console.log('Login Initial Cookie:', currentCookie);

  const ssoRes = await axios.get(ssoUrl, {
    maxRedirects: 0,
    validateStatus: () => true,
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });

  const nextUrl = ssoRes.headers['location'];
  console.log('Step 2 location:', nextUrl);

  const nextRes = await axios.get(nextUrl, {
    maxRedirects: 0,
    validateStatus: () => true,
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });

  const callbackUrl = nextRes.headers['location'];
  console.log('Step 3 callback URL:', callbackUrl);

  // Now step 4: Send the original loginRes.cookie back to old-stdportal.tdtu.edu.vn!
  const finalPortalRes = await axios.get(callbackUrl, {
    maxRedirects: 0,
    validateStatus: () => true,
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Cookie': currentCookie
    }
  });

  console.log('Step 4 Portal Status:', finalPortalRes.status);
  console.log('Step 4 Portal Location:', finalPortalRes.headers['location']);
  console.log('Step 4 Portal Set-Cookie:', finalPortalRes.headers['set-cookie']);

  // If there is another redirect
  let target = finalPortalRes.headers['location'];
  if (finalPortalRes.headers['set-cookie']) {
    currentCookie += '; ' + finalPortalRes.headers['set-cookie'].map(c => c.split(';')[0]).join('; ');
  }

  if (target) {
    if (!target.startsWith('http')) {
      target = 'https://old-stdportal.tdtu.edu.vn' + target;
    }
    console.log('Step 5 Target:', target);
    const homePage = await axios.get(target, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Cookie': currentCookie
      }
    });
    console.log('Step 5 Page Length:', homePage.data.length);
    console.log('Snippet:', homePage.data.substring(0, 400));
  }
}

testRedirectChainDetailed();
