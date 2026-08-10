import { mockClient } from "aws-sdk-client-mock";
import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AgentRegistryControlClient,
  CreateRegistryCommand,
  CreateRegistryRecordCommand,
  GetRegistryRecordCommand,
  ListRegistriesCommand,
  ListRegistryRecordsCommand,
  SubmitRegistryRecordForApprovalCommand,
  TagResourceCommand,
  UpdateRegistryRecordCommand,
  UpdateRegistryRecordStatusCommand,
} from "@aws-sdk/client-agent-registry-control";
import {
  AgentRegistryClient,
  BatchGetDiscoverableRegistryRecordCommand,
  ListDiscoverableRegistryRecordsCommand,
  SearchDiscoverableRegistryRecordsCommand,
} from "@aws-sdk/client-agent-registry";
import {
  batchGetDiscoverableRegistryRecords,
  createRegistry,
  createRegistryRecord,
  getRegistryRecord,
  listDiscoverableRegistryRecords,
  listRegistryActivity,
  listRegistries,
  listRegistryRecords,
  searchRegistryRecords,
  submitRegistryRecord,
  updateRegistryRecord,
  updateRegistryRecordStatus,
} from "./registry.js";

// Registry routes are `authed`: the auth middleware calls auth.api.getSession.
// Mock it to yield a fixed test user so `context.user` is populated.
const TEST_USER = { id: "user_test", name: "Test User", email: "test@example.com" };
vi.mock("@package/auth/server", () => ({
  auth: {
    api: {
      getSession: vi.fn(async () => ({
        session: { id: "sess_test" },
        user: TEST_USER,
      })),
    },
  },
}));

// Activity events are written to Postgres as a side-effect. Mock prisma so the
// write is captured (and never hits a real DB) — its create is spied per test.
const activityCreate = vi.fn((_args: unknown) => Promise.resolve({}));
const activityFindMany = vi.fn((_args: unknown) => Promise.resolve([] as unknown[]));
vi.mock("@package/database", () => ({
  prisma: {
    registryActivityEvent: {
      create: (args: unknown) => activityCreate(args),
      findMany: (args: unknown) => activityFindMany(args),
    },
  },
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cpMock = mockClient(AgentRegistryControlClient as never) as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dpMock = mockClient(AgentRegistryClient as never) as any;

// Invoke an authed procedure with a minimal context (headers) — the mocked
// auth middleware injects the test user.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function callAuthed(proc: unknown, input: unknown): Promise<any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return call(proc as any, input as any, {
    context: { headers: new Headers() },
  });
}

beforeEach(() => {
  cpMock.reset();
  dpMock.reset();
  activityCreate.mockClear();
  activityFindMany.mockClear();
  activityFindMany.mockResolvedValue([]);
});

// ── Create registry record: flat GA descriptors + recordType ────────────────

describe("createRegistryRecord", () => {
  it("sends recordType + flat descriptors and returns {recordArn, recordId, status}", async () => {
    cpMock.on(CreateRegistryRecordCommand).resolves({
      recordArn: "arn:aws:agent-registry:us-east-1:000:registry/r1/record/rec_1",
      status: "CREATING",
    });

    const res = await callAuthed(createRegistryRecord, {
      registryId: "r1",
      name: "my_server",
      recordType: "MCP",
      recordVersion: "1.0",
      descriptors: {
        mcpServer: { data: '{"url":"https://x"}' },
      },
    });

    expect(res).toEqual({
      recordArn:
        "arn:aws:agent-registry:us-east-1:000:registry/r1/record/rec_1",
      recordId: "rec_1",
      status: "CREATING",
    });

    const calls = cpMock.commandCalls(CreateRegistryRecordCommand);
    expect(calls).toHaveLength(1);
    const input = calls[0].args[0].input;
    expect(input.recordType).toBe("MCP");
    expect(input.descriptors).toEqual({ mcpServer: { data: '{"url":"https://x"}' } });
    // old-shape fields must NOT be present
    expect(input.descriptorType).toBeUndefined();
    expect(input.synchronizationType).toBeUndefined();
  });

  it("strips undefined descriptor keys before sending", async () => {
    cpMock.on(CreateRegistryRecordCommand).resolves({ recordArn: "a/rec_x", status: "CREATING" });
    await callAuthed(createRegistryRecord, {
      registryId: "r1",
      name: "c1",
      recordType: "CUSTOM",
      recordVersion: "1.0",
      descriptors: { custom: { data: "{}" }, mcpServer: undefined },
    });
    const input = cpMock.commandCalls(CreateRegistryRecordCommand)[0].args[0].input;
    expect(Object.keys(input.descriptors)).toEqual(["custom"]);
  });

  it("maps ValidationException to BAD_REQUEST", async () => {
    const err = Object.assign(new Error("bad name"), { name: "ValidationException" });
    cpMock.on(CreateRegistryRecordCommand).rejects(err);
    await expect(
      callAuthed(createRegistryRecord, {
        registryId: "r1",
        name: "c1",
        recordType: "CUSTOM",
        recordVersion: "1.0",
        descriptors: { custom: { data: "{}" } },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

// ── Update registry record: PATCH-wrapper nesting (highest-risk code) ────────

describe("updateRegistryRecord — PATCH wrappers", () => {
  beforeEach(() => {
    cpMock.on(UpdateRegistryRecordCommand).resolves({
      registryArn: "arn:aws:agent-registry:us-east-1:000:registry/r1",
      recordArn: "arn:.../record/rec_1",
      recordId: "rec_1",
      name: "n",
      recordType: "MCP",
      status: "UPDATING",
    });
  });

  it("wraps scalar fields in optionalValue", async () => {
    await callAuthed(updateRegistryRecord, {
      registryId: "r1",
      recordId: "rec_1",
      displayName: "New Label",
      description: "d",
      recordVersion: "2.0",
    });
    const input = cpMock.commandCalls(UpdateRegistryRecordCommand)[0].args[0].input;
    expect(input.displayName).toEqual({ optionalValue: "New Label" });
    expect(input.description).toEqual({ optionalValue: "d" });
    // recordVersion is a bare scalar in GA (not wrapped)
    expect(input.recordVersion).toBe("2.0");
  });

  it("nests mcpServer descriptor wrappers to the correct depth", async () => {
    await callAuthed(updateRegistryRecord, {
      registryId: "r1",
      recordId: "rec_1",
      descriptors: {
        mcpServer: {
          data: "SERVER",
          dataSchemaVersion: "v1",
          additionalData: { tools: { data: "TOOLS", dataSchemaVersion: "v2" } },
        },
      },
    });
    const input = cpMock.commandCalls(UpdateRegistryRecordCommand)[0].args[0].input;
    expect(input.descriptors).toEqual({
      optionalValue: {
        mcpServer: {
          optionalValue: {
            data: { optionalValue: "SERVER" },
            dataSchemaVersion: { optionalValue: "v1" },
            additionalData: {
              optionalValue: {
                tools: {
                  optionalValue: {
                    data: { optionalValue: "TOOLS" },
                    dataSchemaVersion: { optionalValue: "v2" },
                  },
                },
              },
            },
          },
        },
      },
    });
  });

  it("wraps custom descriptor and passes triggerSynchronization through", async () => {
    await callAuthed(updateRegistryRecord, {
      registryId: "r1",
      recordId: "rec_1",
      descriptors: { custom: { data: "X" } },
      triggerSynchronization: true,
    });
    const input = cpMock.commandCalls(UpdateRegistryRecordCommand)[0].args[0].input;
    expect(input.descriptors).toEqual({
      optionalValue: { custom: { optionalValue: { data: { optionalValue: "X" } } } },
    });
    expect(input.triggerSynchronization).toBe(true);
  });
});

// ── Approval mapping + tags-on-create ───────────────────────────────────────

describe("createRegistry", () => {
  it("sends tags-on-create, default empty autoApprovalRules, then tags", async () => {
    cpMock.on(ListRegistriesCommand).resolves({ registries: [] });
    cpMock.on(CreateRegistryCommand).resolves({
      registryArn: "arn:aws:agent-registry:us-east-1:000:registry/r-new",
    });
    cpMock.on(TagResourceCommand).resolves({});

    const res = await callAuthed(createRegistry, { name: "my_reg" });
    expect(res).toEqual({
      registryArn: "arn:aws:agent-registry:us-east-1:000:registry/r-new",
    });
    const input = cpMock.commandCalls(CreateRegistryCommand)[0].args[0].input;
    expect(input.approvalConfiguration).toEqual({ autoApprovalRules: [] });
    expect(input.tags).toBeDefined();
  });

  it("rejects a duplicate name with CONFLICT", async () => {
    cpMock.on(ListRegistriesCommand).resolves({
      registries: [{ name: "dupe", registryId: "r1", registryArn: "a", status: "READY", updatedAt: new Date() }],
    });
    await expect(callAuthed(createRegistry, { name: "dupe" })).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });
});

// ── List pagination + status filter ─────────────────────────────────────────

describe("listRegistries — pagination", () => {
  it("follows nextToken across pages", async () => {
    cpMock
      .on(ListRegistriesCommand)
      .resolvesOnce({
        registries: [
          { name: "a", registryId: "r1", registryArn: "arn:a", status: "READY", updatedAt: new Date() },
        ],
        nextToken: "TOK",
      })
      .resolvesOnce({
        registries: [
          { name: "b", registryId: "r2", registryArn: "arn:b", status: "READY", updatedAt: new Date() },
        ],
      });

    const res = await callAuthed(listRegistries, {});
    expect(res.registries.map((r: { registryId: string }) => r.registryId)).toEqual(["r1", "r2"]);
    expect(cpMock.commandCalls(ListRegistriesCommand)).toHaveLength(2);
  });
});

describe("listRegistryRecords — status filter", () => {
  it("passes a structured filters array and maps recordType", async () => {
    cpMock.on(ListRegistryRecordsCommand).resolves({
      registryRecords: [
        {
          registryArn: "arn:a",
          recordId: "rec_1",
          name: "n",
          recordType: "MCP",
          status: "APPROVED",
          updatedAt: new Date(),
        },
      ],
    });
    const res = await callAuthed(listRegistryRecords, { registryId: "r1", status: "APPROVED" });
    expect(res.registryRecords[0].recordType).toBe("MCP");
    const input = cpMock.commandCalls(ListRegistryRecordsCommand)[0].args[0].input;
    expect(input.filters).toEqual([{ name: "status", values: ["APPROVED"] }]);
  });
});

// ── Get / submit / status ───────────────────────────────────────────────────

describe("getRegistryRecord", () => {
  it("returns the GA record shape (recordType + flat descriptors)", async () => {
    cpMock.on(GetRegistryRecordCommand).resolves({
      registryArn: "arn:a",
      recordId: "rec_1",
      name: "n",
      recordType: "MCP",
      status: "APPROVED",
      descriptors: { mcpServer: { data: '{"url":"https://x"}' } },
      updatedAt: new Date(),
    });
    const res = await callAuthed(getRegistryRecord, { registryId: "r1", recordId: "rec_1" });
    expect(res.registryRecord.recordType).toBe("MCP");
    expect(res.registryRecord.descriptors?.mcpServer?.data).toBe('{"url":"https://x"}');
  });
});

describe("submitRegistryRecord", () => {
  it("returns {recordId, recordArn, status}", async () => {
    cpMock.on(SubmitRegistryRecordForApprovalCommand).resolves({
      registryArn: "arn:a",
      recordArn: "arn:.../record/rec_1",
      recordId: "rec_1",
      status: "PENDING_APPROVAL",
      updatedAt: new Date(),
    });
    const res = await callAuthed(submitRegistryRecord, { registryId: "r1", recordId: "rec_1" });
    expect(res).toMatchObject({ recordId: "rec_1", status: "PENDING_APPROVAL" });
  });
});

describe("updateRegistryRecordStatus", () => {
  it("sends status + defaulted statusReason", async () => {
    cpMock.on(UpdateRegistryRecordStatusCommand).resolves({
      registryArn: "arn:a",
      recordArn: "arn:.../record/rec_1",
      recordId: "rec_1",
      status: "APPROVED",
      statusReason: "Status changed to APPROVED",
      updatedAt: new Date(),
    });
    const res = await callAuthed(updateRegistryRecordStatus, {
      registryId: "r1",
      recordId: "rec_1",
      status: "APPROVED",
    });
    expect(res).toMatchObject({ status: "APPROVED" });
    const input = cpMock.commandCalls(UpdateRegistryRecordStatusCommand)[0].args[0].input;
    expect(input.status).toBe("APPROVED");
    expect(input.statusReason).toBe("Status changed to APPROVED");
  });

  it("writes a status_changed activity event carrying the reason", async () => {
    cpMock.on(UpdateRegistryRecordStatusCommand).resolves({
      registryArn: "arn:a",
      recordArn: "arn:.../record/rec_1",
      recordId: "rec_1",
      status: "REJECTED",
      statusReason: "schema missing field",
      updatedAt: new Date(),
    });
    await callAuthed(updateRegistryRecordStatus, {
      registryId: "r1",
      recordId: "rec_1",
      status: "REJECTED",
      statusReason: "schema missing field",
    });
    expect(activityCreate).toHaveBeenCalledTimes(1);
    const data = (activityCreate.mock.calls[0][0] as { data: any }).data;
    expect(data).toMatchObject({
      registryId: "r1",
      recordId: "rec_1",
      type: "status_changed",
      actorId: "user_test",
      metadata: { status: "REJECTED", statusReason: "schema missing field" },
    });
    expect(data.description).toContain("schema missing field");
  });

  it("does not fail the operation when the activity write throws (best-effort)", async () => {
    cpMock.on(UpdateRegistryRecordStatusCommand).resolves({
      registryArn: "arn:a",
      recordArn: "arn:.../record/rec_1",
      recordId: "rec_1",
      status: "APPROVED",
      statusReason: "ok",
      updatedAt: new Date(),
    });
    activityCreate.mockRejectedValueOnce(new Error("db down"));
    const res = await callAuthed(updateRegistryRecordStatus, {
      registryId: "r1",
      recordId: "rec_1",
      status: "APPROVED",
    });
    expect(res).toMatchObject({ status: "APPROVED" });
  });
});

// ── Data plane: search uses the new command + recordType result ─────────────

describe("searchRegistryRecords", () => {
  it("uses SearchDiscoverableRegistryRecords and surfaces recordType", async () => {
    dpMock.on(SearchDiscoverableRegistryRecordsCommand).resolves({
      registryRecords: [
        {
          registryArn: "arn:a",
          recordId: "rec_1",
          name: "n",
          recordType: "MCP",
          status: "APPROVED",
        },
      ],
    });
    const res = await callAuthed(searchRegistryRecords, {
      registryIds: ["arn:a"],
      searchQuery: "weather",
      maxResults: 10,
    });
    expect(res.registryRecords?.[0]?.recordType).toBe("MCP");
    expect(dpMock.commandCalls(SearchDiscoverableRegistryRecordsCommand)).toHaveLength(1);
  });

  it("passes a recordType filter through to the command", async () => {
    dpMock.on(SearchDiscoverableRegistryRecordsCommand).resolves({ registryRecords: [] });
    await callAuthed(searchRegistryRecords, {
      registryIds: ["arn:a"],
      searchQuery: "x",
      maxResults: 10,
      filters: [{ name: "recordType", values: ["MCP"] }],
    });
    const input = dpMock.commandCalls(SearchDiscoverableRegistryRecordsCommand)[0].args[0].input;
    expect(input.filters).toEqual([{ name: "recordType", values: ["MCP"] }]);
  });
});

// ── Browse APIs (List / BatchGet Discoverable) ──────────────────────────────

describe("listDiscoverableRegistryRecords", () => {
  it("returns a page + nextToken and forwards registryId/filters", async () => {
    dpMock.on(ListDiscoverableRegistryRecordsCommand).resolves({
      registryRecords: [
        {
          registryArn: "arn:a",
          recordId: "rec_1",
          name: "n",
          recordType: "MCP",
          status: "APPROVED",
        },
      ],
      nextToken: "TOK",
    });
    const res = await callAuthed(listDiscoverableRegistryRecords, {
      registryId: "r1",
      maxResults: 50,
      filters: [{ name: "recordType", values: ["MCP"] }],
    });
    expect(res.registryRecords).toHaveLength(1);
    expect(res.nextToken).toBe("TOK");
    const input = dpMock.commandCalls(ListDiscoverableRegistryRecordsCommand)[0].args[0].input;
    expect(input.registryId).toBe("r1");
    expect(input.filters).toEqual([{ name: "recordType", values: ["MCP"] }]);
  });
});

describe("batchGetDiscoverableRegistryRecords", () => {
  it("wraps recordIds into a single entry and returns records + errors", async () => {
    dpMock.on(BatchGetDiscoverableRegistryRecordCommand).resolves({
      registryRecords: [
        {
          registryArn: "arn:a",
          recordId: "rec_1",
          name: "n",
          recordType: "MCP",
          status: "APPROVED",
          descriptors: { mcpServer: { data: "{}" } },
        },
      ],
      errors: [
        { registryId: "r1", recordId: "rec_2", errorCode: "RESOURCE_NOT_FOUND", message: "gone" },
      ],
    });
    const res = await callAuthed(batchGetDiscoverableRegistryRecords, {
      registryId: "r1",
      recordIds: ["rec_1", "rec_2"],
    });
    expect(res.registryRecords[0].recordType).toBe("MCP");
    expect(res.errors?.[0]).toMatchObject({ recordId: "rec_2", errorCode: "RESOURCE_NOT_FOUND" });
    const input = dpMock.commandCalls(BatchGetDiscoverableRegistryRecordCommand)[0].args[0].input;
    expect(input.entries).toEqual([{ registryId: "r1", recordIds: ["rec_1", "rec_2"] }]);
  });
});

// ── Activity log ────────────────────────────────────────────────────────────

describe("listRegistryActivity", () => {
  it("record-scoped: filters by registryId + recordId and maps actor/timestamp", async () => {
    activityFindMany.mockResolvedValueOnce([
      {
        id: "evt_1",
        registryId: "r1",
        recordId: "rec_1",
        type: "status_changed",
        description: 'Status changed to REJECTED — "nope"',
        metadata: { status: "REJECTED", statusReason: "nope" },
        createdAt: new Date("2026-08-07T00:00:00Z"),
        actor: { name: "Test User", email: "test@example.com" },
      },
    ]);
    const res = await callAuthed(listRegistryActivity, {
      registryId: "r1",
      recordId: "rec_1",
    });
    expect(res.events).toHaveLength(1);
    expect(res.events[0]).toMatchObject({
      type: "status_changed",
      actor: { name: "Test User", email: "test@example.com" },
      metadata: { status: "REJECTED", statusReason: "nope" },
    });
    const where = (activityFindMany.mock.calls[0][0] as { where: any }).where;
    expect(where).toEqual({ registryId: "r1", recordId: "rec_1" });
  });

  it("registry-scoped: omits recordId filter when not provided", async () => {
    await callAuthed(listRegistryActivity, { registryId: "r1" });
    const where = (activityFindMany.mock.calls[0][0] as { where: any }).where;
    expect(where).toEqual({ registryId: "r1" });
  });

  it("tolerates a null actor (deleted user)", async () => {
    activityFindMany.mockResolvedValueOnce([
      {
        id: "evt_2",
        registryId: "r1",
        recordId: null,
        type: "registry_created",
        description: "Registry created",
        metadata: {},
        createdAt: new Date("2026-08-07T00:00:00Z"),
        actor: null,
      },
    ]);
    const res = await callAuthed(listRegistryActivity, { registryId: "r1" });
    expect(res.events[0].actor).toBeNull();
  });
});
