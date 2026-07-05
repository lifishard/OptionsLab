// Manually seed yahoo-finance2's cookie jar + crumb before any API call.
//
// Why: on cloud egress (Railway, Fly, etc.), the library's default flow of
// GET-ing `finance.yahoo.com/quote/AAPL` to obtain cookies fails — Yahoo's
// edge routes the request through a consent-gate that doesn't send back the
// required Set-Cookie. yahoo-finance2 then throws:
//   "No set-cookie header present in Yahoo's response."
//
// The community-established workaround (see the Node/Python threads on
// gadicc/node-yahoo-finance2 issues #764 / #695) is:
//   1. Hit `https://fc.yahoo.com` to grab the A1/A3 cookies (this endpoint
//      returns 404 but always sends Set-Cookie).
//   2. Hit `https://query1.finance.yahoo.com/v1/test/getcrumb` with that
//      cookie + a browser UA to receive the crumb token.
//   3. Push the cookie into yahoo-finance2's ExtendedCookieJar, and store
//      the crumb as a cookie at the library's internal fake URL
//      (`http://config.yf2/`) — the library will then skip its own broken
//      handshake and re-use our values on every request.

import { Cookie } from "tough-cookie";
import { ExtendedCookieJar } from "yahoo-finance2/lib/cookieJar";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const CONFIG_FAKE_URL = "http://config.yf2/";

export async function seedYahooCrumb(cookieJar: ExtendedCookieJar): Promise<string> {
  // Step 1: fetch A1/A3 cookies from fc.yahoo.com. Returns 404 with cookies.
  const step1 = await fetch("https://fc.yahoo.com", {
    method: "GET",
    headers: { "User-Agent": UA },
    redirect: "manual",
  });
  // Node 18+ / undici's Headers supports getSetCookie(); fall back to raw.
  const rawSetCookies: string[] =
    typeof (step1.headers as any).getSetCookie === "function"
      ? (step1.headers as any).getSetCookie()
      : (step1.headers.get("set-cookie") ? [step1.headers.get("set-cookie") as string] : []);

  if (rawSetCookies.length === 0) {
    throw new Error(
      "[yahoo-seed] fc.yahoo.com returned no Set-Cookie (status " + step1.status + ")",
    );
  }

  // Store each cookie in the jar under .yahoo.com so subsequent yahoo-finance2
  // fetches include it via cookieJar.getCookieString(...).
  for (const raw of rawSetCookies) {
    await cookieJar.setFromSetCookieHeaders([raw], "https://fc.yahoo.com/");
  }

  // Build a short cookie header for the getcrumb call (name=value pairs only).
  const cookieHeader = rawSetCookies.map((c) => c.split(";")[0]).join("; ");

  // Step 2: exchange cookie for crumb.
  const step2 = await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb", {
    method: "GET",
    headers: {
      "User-Agent": UA,
      "Accept": "*/*",
      "Accept-Language": "en-US,en;q=0.9",
      "Referer": "https://finance.yahoo.com/",
      "Origin": "https://finance.yahoo.com",
      "cookie": cookieHeader,
    },
  });

  if (step2.status !== 200) {
    throw new Error(
      "[yahoo-seed] getcrumb failed with status " + step2.status,
    );
  }
  const crumb = (await step2.text()).trim();
  if (!crumb) {
    throw new Error("[yahoo-seed] getcrumb returned empty body");
  }

  // Step 3: store crumb where yahoo-finance2's getCrumb.ts expects it.
  await cookieJar.setCookie(
    new Cookie({ key: "crumb", value: crumb }),
    CONFIG_FAKE_URL,
  );

  return crumb;
}
