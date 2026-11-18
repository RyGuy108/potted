import { actionHeaders } from "@/lib/blinks";

export const dynamic = "force-static";

/**
 * Tells wallets and X which pages on this site are Solana Actions: a
 * challenge page (/c/<id>) unfurls into the pledge card served by the API.
 */
export function GET() {
  return Response.json(
    {
      rules: [
        { pathPattern: "/c/*", apiPath: "/api/actions/pledge/*" },
        { pathPattern: "/api/actions/**", apiPath: "/api/actions/**" },
      ],
    },
    { headers: actionHeaders() },
  );
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: actionHeaders() });
}
