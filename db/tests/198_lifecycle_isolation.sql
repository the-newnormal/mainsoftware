-- test-db: repeatable read
-- PDPA-09, ADM-08 (C0.10 PR 1, 0013; LH-18, LH-21; TECH-SPEC T23 item 12; review HOLDS-03): a hold
-- is decided only under READ COMMITTED. lifecycle_held() takes its locks and then reads in later
-- statements, each with a new snapshot under READ COMMITTED, so it sees a request or a hold that
-- committed while its locks waited. Under REPEATABLE READ every read would see the transaction's
-- first snapshot and answer "not held" past a request that had just committed, so it refuses first
-- (25000), and with it every caller. The cases:
--   LCD-13 is_held() refuses (25000) for a person nothing holds;
--   LCD-09 the owner's logged delete of a released legal hold, which nothing holds, refuses (25000),
--          and so does the superuser's;
--   LCD-27 delete_case() of a request past its period refuses (25000), deleting and logging nothing.
-- Each would pass under READ COMMITTED (190's LCD-09 and LCD-13, 196's LCD-28). The first line asks
-- scripts/test-db.sh to run this test REPEATABLE READ. The two-org fixture sets managers, which this
-- level refuses (0002), so this builds its own small org, as 085 does; everyone in it is made up.
do $$
begin
  if current_setting('transaction_isolation') <> 'repeatable read' then
    raise exception 'scripts/test-db.sh did not run this test REPEATABLE READ';
  end if;
end
$$;

-- Runs a statement that must fail with the given SQLSTATE and message.
create function pg_temp.expect_error(stmt text, state text, message_like text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    if sqlstate = state and sqlerrm ilike message_like then
      return;
    end if;
    raise exception 'expected % % but got % (%) from: %', state, message_like, sqlstate, sqlerrm, stmt;
  end;
  raise exception 'expected % from: %', state, stmt;
end
$$;

-- Org 4: Hearth (a0), an Owner who places holds (a1), the DPO who logs requests (a5) and a member
-- (a8). A legal hold on a8, released (e1); a complaint from someone without an account, answered
-- 800 days ago (e2), with its first step.
insert into public.orgs (id, name) values ('f4000000-0000-4000-8000-000000000000', 'Test org 4');
insert into public.principals (id, org_id, kind, system_key) values
  ('f4000000-0000-4000-8000-0000000000a0', 'f4000000-0000-4000-8000-000000000000', 'system', 'hearth');
insert into public.principals (id, org_id, kind) values
  ('f4000000-0000-4000-8000-0000000000a1', 'f4000000-0000-4000-8000-000000000000', 'human'),
  ('f4000000-0000-4000-8000-0000000000a5', 'f4000000-0000-4000-8000-000000000000', 'human'),
  ('f4000000-0000-4000-8000-0000000000a8', 'f4000000-0000-4000-8000-000000000000', 'human');
insert into public.people (id, org_id, full_name, created_by) values
  ('f4000000-0000-4000-8000-0000000000a1', 'f4000000-0000-4000-8000-000000000000', 'Ola Owner', 'f4000000-0000-4000-8000-0000000000a0'),
  ('f4000000-0000-4000-8000-0000000000a5', 'f4000000-0000-4000-8000-000000000000', 'Dee Officer', 'f4000000-0000-4000-8000-0000000000a0'),
  ('f4000000-0000-4000-8000-0000000000a8', 'f4000000-0000-4000-8000-000000000000', 'Mo Member', 'f4000000-0000-4000-8000-0000000000a0');
insert into public.legal_holds (id, org_id, client_key, target_kind, target_id, reason, placed_by, released_at, released_by,
                                release_reason)
values ('f4000000-0000-4000-8000-0000000000e1', 'f4000000-0000-4000-8000-000000000000', gen_random_uuid(), 'person',
        'f4000000-0000-4000-8000-0000000000a8', 'A made-up matter', 'f4000000-0000-4000-8000-0000000000a1', now(),
        'f4000000-0000-4000-8000-0000000000a1', 'The matter closed');
insert into public.cases (id, org_id, client_key, kind, came_by, received_on, logged_by, requester_name, requester_channel,
                          requester_contact, details)
values ('f4000000-0000-4000-8000-0000000000e2', 'f4000000-0000-4000-8000-000000000000', gen_random_uuid(), 'complaint', 'email',
        (now() at time zone 'Asia/Singapore')::date - 801, 'f4000000-0000-4000-8000-0000000000a5', 'Sam Example', 'email',
        'sam@requester.example', 'A request made up for the test.');
insert into public.case_steps (org_id, case_id, number, step, on_day, note, recorded_by)
values ('f4000000-0000-4000-8000-000000000000', 'f4000000-0000-4000-8000-0000000000e2', 1, 'identity_checked',
        (now() at time zone 'Asia/Singapore')::date - 801, 'Matched against the email it came from',
        'f4000000-0000-4000-8000-0000000000a5');
update public.cases
set closed_on = (now() at time zone 'Asia/Singapore')::date - 800, closed_kind = 'complaint', outcome = 'answered', closed_at = now(),
    closed_by = 'f4000000-0000-4000-8000-0000000000a5'
where id = 'f4000000-0000-4000-8000-0000000000e2';

-- LCD-13 (HOLDS-03): is_held(), as the deletion code's definers ask it (the owner, the org set).
set local role hearth_owner;
select set_config('app.org_id', 'f4000000-0000-4000-8000-000000000000', true);
select pg_temp.expect_error($$select public.is_held('person', 'f4000000-0000-4000-8000-0000000000a8')$$, '25000',
                            'Whether something is held is decided only under READ COMMITTED.');

-- LCD-09 (HOLDS-03): the guard, which asks lifecycle_held() once the deletion is logged, as the owner
-- and as the superuser.
select public.log_deletion('legal_holds', 'legal_holds', 'f4000000-0000-4000-8000-0000000000e1', 'retention', null, null, null, null,
                           false);
select pg_temp.expect_error($$delete from public.legal_holds where id = 'f4000000-0000-4000-8000-0000000000e1'$$, '25000',
                            'Whether something is held is decided only under READ COMMITTED.');
reset role;
select pg_temp.expect_error($$delete from public.legal_holds where id = 'f4000000-0000-4000-8000-0000000000e1'$$, '25000',
                            'Whether something is held is decided only under READ COMMITTED.');

-- LCD-27 (HOLDS-03): delete_case() as Hearth, of a request past its period, which nothing holds.
set local role hearth_owner;
select set_config('app.user_id', 'f4000000-0000-4000-8000-0000000000a0', true);
select pg_temp.expect_error($$select public.delete_case('f4000000-0000-4000-8000-0000000000e2', 'retention', false)$$, '25000',
                            'Whether something is held is decided only under READ COMMITTED.');
reset role;
do $$
begin
  if (select count(*) from public.cases where id = 'f4000000-0000-4000-8000-0000000000e2') <> 1
     or (select count(*) from public.legal_holds where id = 'f4000000-0000-4000-8000-0000000000e1') <> 1
     or exists (select 1 from public.deletion_log where object_id = 'f4000000-0000-4000-8000-0000000000e2')
     or exists (select 1 from public.audit_events where action = 'case.deleted'
                and target_id = 'f4000000-0000-4000-8000-0000000000e2') then
    raise exception 'a refusal under REPEATABLE READ deleted or logged something (HOLDS-03)';
  end if;
end
$$;
