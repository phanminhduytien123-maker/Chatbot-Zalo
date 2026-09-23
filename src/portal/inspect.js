import axios from 'axios';
import * as cheerio from 'cheerio';

async function inspectScripts() {
  try {
    const res = await axios.get('https://old-stdportal.tdtu.edu.vn/Login/Index', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const $ = cheerio.load(res.data);
    $('script').each((i, el) => {
      const src = $(el).attr('src');
      const text = $(el).html();
      if (src) {
        console.log('Script src:', src);
      }
      if (text && (text.includes('ajax') || text.includes('Login') || text.includes('txtUser') || text.includes('txtPass') || text.includes('submit'))) {
        console.log('--- Inline Script Snippet ---');
        console.log(text.trim());
      }
    });
  } catch (err) {
    console.error('Inspect error:', err.message);
  }
}

inspectScripts();
