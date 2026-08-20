// Renders HTML to a PDF buffer using headless Chromium.
// @sparticuz/chromium ships a Vercel/Lambda-compatible Chromium binary;
// puppeteer-core drives it. Both are dynamically imported so that routes
// which never touch PDF generation don't pay the cold-start cost.
let browserPromise;

async function getBrowser(){
  if(browserPromise)return browserPromise;
  browserPromise=(async()=>{
    const [{default:chromium},{default:puppeteer}]=await Promise.all([
      import('@sparticuz/chromium'),
      import('puppeteer-core'),
    ]);
    const executablePath=await chromium.executablePath();
    return puppeteer.launch({
      args:chromium.args,
      defaultViewport:chromium.defaultViewport,
      executablePath,
      headless:chromium.headless,
    });
  })();
  return browserPromise.catch(err=>{browserPromise=null;throw err;});
}

// html: full standalone HTML string (all assets/fonts embedded as data URIs —
// the function runs with no guaranteed network access to the site's own origin).
// pdfOptions: passed straight to page.pdf(); printBackground defaults to true
// so exported documents never depend on a "background graphics" checkbox again,
// and displayHeaderFooter defaults to false so no browser-injected date/URL/page count.
export async function renderPdf(html,pdfOptions={}){
  const browser=await getBrowser();
  const page=await browser.newPage();
  try{
    await page.setContent(html,{waitUntil:'networkidle0'});
    await page.evaluate(()=>document.fonts&&document.fonts.ready);
    return await page.pdf({printBackground:true,displayHeaderFooter:false,...pdfOptions});
  }finally{
    await page.close();
  }
}
