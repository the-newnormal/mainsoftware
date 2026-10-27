// The lenient readings of GET /api/requests and of POST /api/requests/send's answer (C0.9 OD-15,
// PD-96, PD-97), on their own so api/queries.ts's ownRequestsQuery and sendRequest() load them only
// when they first run. The boot's bundle then carries none of the requests' schemas (packages/shared
// cases.ts), which only Settings › Privacy and the DPO's queue read.
export { MyRequestsResponseForClient, SendRequestResponseForClient } from '@hearth/shared'
