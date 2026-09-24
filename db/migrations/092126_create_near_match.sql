-- migrate:up

CREATE TABLE near_match (
  ...
);

-- migrate:down

DROP TABLE near_match;