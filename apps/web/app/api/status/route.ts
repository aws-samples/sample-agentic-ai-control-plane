export async function GET(request: Request) {
  return Response.json({
    status: 200,
    message: "Frontend Healthly",
  });
}
