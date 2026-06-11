-- Personal profile fallback author for LinkedIn publishing.
-- Page posting (urn:li:organization) requires w_organization_social which
-- LinkedIn gates behind Community Management API approval; until granted,
-- posts are published as the connected member (urn:li:person).
alter table clients add column if not exists linkedin_person_id text;
