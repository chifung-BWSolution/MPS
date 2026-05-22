import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BUBBLE_API_URL = Deno.env.get('BUBBLE_API_URL') || 'https://chifung.net/api/1.1/obj';
const BUBBLE_API_KEY = Deno.env.get('BUBBLE_API_KEY') || '';

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders, status: 200 });
  }

  try {
    const { dataType, params, method, id, body } = await req.json();

    if (!dataType) {
      return new Response(
        JSON.stringify({ error: 'dataType is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    if (!BUBBLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'BUBBLE_API_KEY not configured on server' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    // Build the Bubble API URL
    let url = `${BUBBLE_API_URL}/${dataType}`;
    if (id) {
      url += `/${id}`;
    }

    // Build query string for GET requests
    if (method === 'GET' && params) {
      const queryParts: string[] = [];
      if (params.constraints && params.constraints.length > 0) {
        queryParts.push(`constraints=${encodeURIComponent(JSON.stringify(params.constraints))}`);
      }
      if (params.sort_field) {
        queryParts.push(`sort_field=${encodeURIComponent(params.sort_field)}`);
      }
      if (params.descending !== undefined) {
        queryParts.push(`descending=${params.descending}`);
      }
      if (params.limit !== undefined) {
        queryParts.push(`limit=${params.limit}`);
      }
      if (params.cursor !== undefined) {
        queryParts.push(`cursor=${params.cursor}`);
      }
      if (queryParts.length > 0) {
        url += `?${queryParts.join('&')}`;
      }
    }

    const fetchOptions: RequestInit = {
      method: method || 'GET',
      headers: {
        'Authorization': `Bearer ${BUBBLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
    };

    if ((method === 'POST' || method === 'PATCH') && body) {
      fetchOptions.body = JSON.stringify(body);
    }

    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
      const errorText = await response.text();
      return new Response(
        JSON.stringify({ error: `Bubble API error (${response.status}): ${errorText}` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: response.status }
      );
    }

    // For DELETE, return success
    if (method === 'DELETE') {
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    const data = await response.json();
    return new Response(
      JSON.stringify(data),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
