CREATE TABLE "account_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"token_digest" varchar(64) NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"absolute_expires_at" timestamp with time zone NOT NULL,
	"last_activity_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "account_sessions_token_digest_key" UNIQUE("token_digest"),
	CONSTRAINT "account_sessions_digest_check" CHECK ("account_sessions"."token_digest" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "account_sessions_expiry_check" CHECK ("account_sessions"."absolute_expires_at" = "account_sessions"."issued_at" + interval '12 hours'),
	CONSTRAINT "account_sessions_activity_check" CHECK ("account_sessions"."last_activity_at" >= "account_sessions"."issued_at")
);
--> statement-breakpoint
ALTER TABLE "account_sessions" ADD CONSTRAINT "account_sessions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_sessions_account_id_idx" ON "account_sessions" USING btree ("account_id");