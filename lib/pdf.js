// Renders HTML to a PDF buffer using headless Chromium.
// @sparticuz/chromium ships a Vercel/Lambda-compatible Chromium binary;
// puppeteer-core drives it. Both are dynamically imported so that routes
// which never touch PDF generation don't pay the cold-start cost.
let browserPromise;

async function getBrowser(){
  if(browserPromise)return browserPromise;
  browserPromise=(async()=>{
    // @sparticuz/chromium only extracts the Amazon Linux 2023 shared libraries
    // (libnss3.so etc, needed to launch Chromium at all) when it detects an
    // AWS-Lambda-style runtime via AWS_LAMBDA_JS_RUNTIME/AWS_EXECUTION_ENV.
    // Vercel's Node functions run on the same base image but never set those
    // vars, so without this the launch fails with "libnss3.so: cannot open
    // shared object file". Spoofing it makes the package extract+link them.
    process.env.AWS_LAMBDA_JS_RUNTIME??='nodejs20.x';
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
    // puppeteer-core returns a Uint8Array (not a Node Buffer). Vercel's
    // res.send() only streams raw bytes for an actual Buffer; a plain
    // Uint8Array is treated as a generic object and gets JSON-serialized
    // (`{"0":37,"1":80,...}`), producing a file that looks like a PDF but
    // fails to open. Wrapping it in Buffer.from fixes that without a copy.
    const pdf=await page.pdf({printBackground:true,displayHeaderFooter:false,...pdfOptions});
    return Buffer.from(pdf);
  }finally{
    await page.close();
  }
}
