-- Atomic application of user-reviewed CV profile data.
-- The PDF and extracted raw text are never accepted or stored here.

create or replace function public.apply_cv_profile_import(
  p_user_id uuid,
  p_profile jsonb default '{}'::jsonb,
  p_education jsonb default '[]'::jsonb,
  p_experience jsonb default '[]'::jsonb,
  p_skills jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.users%rowtype;
  v_headline text;
  v_bio text;
  v_languages text[];
  v_skill jsonb;
  v_skill_id integer;
  v_skill_name text;
  v_skill_category text;
  v_inserted integer;
  v_education_inserted integer := 0;
  v_experience_inserted integer := 0;
  v_skills_inserted integer := 0;
begin
  p_profile := coalesce(p_profile, '{}'::jsonb);
  p_education := coalesce(p_education, '[]'::jsonb);
  p_experience := coalesce(p_experience, '[]'::jsonb);
  p_skills := coalesce(p_skills, '[]'::jsonb);

  if jsonb_typeof(p_profile) <> 'object' then
    raise exception 'profile must be an object';
  end if;

  if jsonb_typeof(p_education) <> 'array'
     or jsonb_typeof(p_experience) <> 'array'
     or jsonb_typeof(p_skills) <> 'array' then
    raise exception 'education, experience and skills must be arrays';
  end if;

  select *
    into v_user
    from public.users
   where id = p_user_id
   for update;

  if not found then
    raise exception 'Profile not found';
  end if;

  -- Scalar profile values are changed only when the current value is empty,
  -- unless the reviewed payload explicitly permits replacement.
  if p_profile ? 'headline' then
    v_headline := nullif(btrim(p_profile #>> '{headline,value}'), '');

    if v_headline is not null
       and (
         nullif(btrim(v_user.headline), '') is null
         or coalesce(
           (p_profile #>> '{headline,replaceExisting}')::boolean,
           false
         )
       ) then
      v_user.headline := left(v_headline, 120);
    end if;
  end if;

  if p_profile ? 'bio' then
    v_bio := nullif(btrim(p_profile #>> '{bio,value}'), '');

    if v_bio is not null
       and (
         nullif(btrim(v_user.bio), '') is null
         or coalesce(
           (p_profile #>> '{bio,replaceExisting}')::boolean,
           false
         )
       ) then
      v_user.bio := left(v_bio, 500);
    end if;
  end if;

  -- Languages are merged case-insensitively; existing values are preserved.
  if p_profile ? 'languages' then
    if jsonb_typeof(p_profile -> 'languages') <> 'array' then
      raise exception 'profile.languages must be an array';
    end if;

    select coalesce(array_agg(value order by first_position), '{}'::text[])
      into v_languages
      from (
        select distinct on (lower(value))
          value,
          position as first_position
        from (
          select
            btrim(language) as value,
            ordinality::bigint as position
          from unnest(coalesce(v_user.languages, '{}'::text[]))
            with ordinality as existing_languages(language, ordinality)

          union all

          select
            btrim(language) as value,
            1000000 + ordinality::bigint as position
          from jsonb_array_elements_text(p_profile -> 'languages')
            with ordinality as imported_languages(language, ordinality)
        ) all_languages
        where value <> ''
        order by lower(value), position
      ) deduplicated_languages;

    v_user.languages := v_languages;
  end if;

  update public.users
     set headline = v_user.headline,
         bio = v_user.bio,
         languages = v_user.languages,
         updated_at = now()
   where id = p_user_id;

  -- Education is append-and-deduplicate, never full replace.
  with incoming as (
    select
      btrim(institution) as institution,
      nullif(btrim(degree), '') as degree,
      nullif(btrim(field), '') as field,
      "startYear" as start_year,
      "endYear" as end_year,
      nullif(btrim(description), '') as description
    from jsonb_to_recordset(p_education) as item(
      institution text,
      degree text,
      field text,
      "startYear" smallint,
      "endYear" smallint,
      description text
    )
    where nullif(btrim(institution), '') is not null
  ),
  deduplicated as (
    select distinct on (
      lower(institution),
      lower(coalesce(degree, '')),
      lower(coalesce(field, '')),
      start_year,
      end_year
    )
      institution,
      degree,
      field,
      start_year,
      end_year,
      description
    from incoming
    order by
      lower(institution),
      lower(coalesce(degree, '')),
      lower(coalesce(field, '')),
      start_year,
      end_year
  ),
  numbered as (
    select
      item.*,
      (
        coalesce(
          (select max(sort_order)
             from public.user_education
            where user_id = p_user_id),
          -1
        )
        + row_number() over (
          order by lower(institution), start_year nulls last
        )
      )::smallint as new_sort_order
    from deduplicated item
  )
  insert into public.user_education (
    user_id,
    institution,
    degree,
    field,
    start_year,
    end_year,
    description,
    sort_order
  )
  select
    p_user_id,
    item.institution,
    item.degree,
    item.field,
    item.start_year,
    item.end_year,
    item.description,
    item.new_sort_order
  from numbered item
  where not exists (
    select 1
    from public.user_education existing
    where existing.user_id = p_user_id
      and lower(btrim(existing.institution)) =
          lower(btrim(item.institution))
      and lower(coalesce(btrim(existing.degree), '')) =
          lower(coalesce(btrim(item.degree), ''))
      and lower(coalesce(btrim(existing.field), '')) =
          lower(coalesce(btrim(item.field), ''))
      and existing.start_year is not distinct from item.start_year
      and existing.end_year is not distinct from item.end_year
  );

  get diagnostics v_education_inserted = row_count;

  -- Experience is append-and-deduplicate, never full replace.
  with incoming as (
    select
      btrim(company) as company,
      btrim(role) as role,
      "startDate" as start_date,
      "endDate" as end_date,
      nullif(btrim(description), '') as description
    from jsonb_to_recordset(p_experience) as item(
      company text,
      role text,
      "startDate" date,
      "endDate" date,
      description text
    )
    where nullif(btrim(company), '') is not null
      and nullif(btrim(role), '') is not null
  ),
  deduplicated as (
    select distinct on (
      lower(company),
      lower(role),
      start_date,
      end_date
    )
      company,
      role,
      start_date,
      end_date,
      description
    from incoming
    order by lower(company), lower(role), start_date, end_date
  ),
  numbered as (
    select
      item.*,
      (
        coalesce(
          (select max(sort_order)
             from public.user_experience
            where user_id = p_user_id),
          -1
        )
        + row_number() over (
          order by start_date nulls last, lower(company), lower(role)
        )
      )::smallint as new_sort_order
    from deduplicated item
  )
  insert into public.user_experience (
    user_id,
    company,
    role,
    start_date,
    end_date,
    description,
    sort_order
  )
  select
    p_user_id,
    item.company,
    item.role,
    item.start_date,
    item.end_date,
    item.description,
    item.new_sort_order
  from numbered item
  where not exists (
    select 1
    from public.user_experience existing
    where existing.user_id = p_user_id
      and lower(btrim(existing.company)) =
          lower(btrim(item.company))
      and lower(btrim(existing.role)) =
          lower(btrim(item.role))
      and existing.start_date is not distinct from item.start_date
      and existing.end_date is not distinct from item.end_date
  );

  get diagnostics v_experience_inserted = row_count;

  -- Approved unmatched skills become catalog entries instead of vanishing.
  for v_skill in
    select value
    from jsonb_array_elements(p_skills)
  loop
    v_skill_id := nullif(v_skill ->> 'catalogSkillId', '')::integer;
    v_skill_name := nullif(btrim(v_skill ->> 'name'), '');
    v_skill_category := coalesce(
      nullif(btrim(v_skill ->> 'category'), ''),
      'Other'
    );

    if v_skill_category not in (
      'Tech',
      'Design',
      'Business',
      'Science',
      'Other'
    ) then
      v_skill_category := 'Other';
    end if;

    if v_skill_id is not null then
      perform 1
      from public.skill_catalog
      where id = v_skill_id;

      if not found then
        raise exception 'Unknown skill catalog id: %', v_skill_id;
      end if;
    else
      if v_skill_name is null then
        raise exception 'Each skill requires catalogSkillId or name';
      end if;

      perform pg_advisory_xact_lock(
        hashtextextended(lower(v_skill_name), 0)
      );

      select id
        into v_skill_id
        from public.skill_catalog
       where lower(name) = lower(v_skill_name)
       order by id
       limit 1;

      if v_skill_id is null then
        insert into public.skill_catalog (name, category)
        values (left(v_skill_name, 100), v_skill_category)
        returning id into v_skill_id;
      end if;
    end if;

    insert into public.user_skills (
      user_id,
      skill_id,
      source
    )
    values (
      p_user_id,
      v_skill_id,
      'cv_extracted'
    )
    on conflict (user_id, skill_id) do nothing;

    get diagnostics v_inserted = row_count;
    v_skills_inserted := v_skills_inserted + v_inserted;
  end loop;

  return jsonb_build_object(
    'applied',
    jsonb_build_object(
      'educationInserted', v_education_inserted,
      'experienceInserted', v_experience_inserted,
      'skillsInserted', v_skills_inserted
    ),
    'user',
    (
      select jsonb_build_object(
        'id', user_row.id,
        'headline', user_row.headline,
        'bio', user_row.bio,
        'languages', coalesce(user_row.languages, '{}'::text[])
      )
      from public.users user_row
      where user_row.id = p_user_id
    ),
    'education',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', education_row.id,
            'institution', education_row.institution,
            'degree', education_row.degree,
            'field', education_row.field,
            'startYear', education_row.start_year,
            'endYear', education_row.end_year,
            'description', education_row.description,
            'sortOrder', education_row.sort_order
          )
          order by education_row.sort_order, education_row.created_at
        )
        from public.user_education education_row
        where education_row.user_id = p_user_id
      ),
      '[]'::jsonb
    ),
    'experience',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', experience_row.id,
            'company', experience_row.company,
            'role', experience_row.role,
            'startDate', experience_row.start_date,
            'endDate', experience_row.end_date,
            'description', experience_row.description,
            'sortOrder', experience_row.sort_order
          )
          order by experience_row.sort_order, experience_row.created_at
        )
        from public.user_experience experience_row
        where experience_row.user_id = p_user_id
      ),
      '[]'::jsonb
    ),
    'skills',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'catalogSkillId', catalog.id,
            'name', catalog.name,
            'category', catalog.category,
            'source', user_skill.source
          )
          order by catalog.name
        )
        from public.user_skills user_skill
        join public.skill_catalog catalog
          on catalog.id = user_skill.skill_id
        where user_skill.user_id = p_user_id
      ),
      '[]'::jsonb
    )
  );
end;
$$;

revoke all
on function public.apply_cv_profile_import(
  uuid,
  jsonb,
  jsonb,
  jsonb,
  jsonb
)
from public, anon, authenticated;

grant execute
on function public.apply_cv_profile_import(
  uuid,
  jsonb,
  jsonb,
  jsonb,
  jsonb
)
to service_role;