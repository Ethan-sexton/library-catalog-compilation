\restrict dbmate

-- Dumped from database version 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 18.6 (Ubuntu 18.6-1.pgdg24.04+2)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pg_trgm; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;


--
-- Name: EXTENSION pg_trgm; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pg_trgm IS 'text similarity measurement and index searching based on trigrams';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: compiled_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.compiled_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    canonical_name text NOT NULL,
    normalized_name text GENERATED ALWAYS AS (TRIM(BOTH FROM regexp_replace(regexp_replace(lower("substring"(canonical_name, '\$a([^$]*)'::text)), '([a-z])\.'::text, '\1'::text, 'g'::text), '[^a-z0-9]+'::text, ' '::text, 'g'::text))) STORED NOT NULL,
    first_word text GENERATED ALWAYS AS (split_part(TRIM(BOTH FROM regexp_replace(regexp_replace(lower("substring"(canonical_name, '\$a([^$]*)'::text)), '([a-z])\.'::text, '\1'::text, 'g'::text), '[^a-z0-9]+'::text, ' '::text, 'g'::text)), ' '::text, 1)) STORED NOT NULL,
    identifier_a smallint NOT NULL,
    identifier_b smallint NOT NULL,
    date date NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT compiled_records_identifier_a_check CHECK (((identifier_a >= 100) AND (identifier_a <= 999))),
    CONSTRAINT compiled_records_identifier_b_check CHECK (((identifier_b >= 100) AND (identifier_b <= 999)))
);


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migrations (
    version character varying NOT NULL
);


--
-- Name: compiled_records compiled_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compiled_records
    ADD CONSTRAINT compiled_records_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: compiled_records_first_word_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX compiled_records_first_word_idx ON public.compiled_records USING btree (first_word);


--
-- Name: compiled_records_normalized_trgm_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX compiled_records_normalized_trgm_idx ON public.compiled_records USING gin (normalized_name public.gin_trgm_ops);


--
-- PostgreSQL database dump complete
--

\unrestrict dbmate


--
-- Dbmate schema migrations
--

INSERT INTO public.schema_migrations (version) VALUES
    ('092426');
