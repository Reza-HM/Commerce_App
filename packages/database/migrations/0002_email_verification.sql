CREATE TABLE "account_email_verifications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"token_digest" varchar(64) NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "account_email_verifications_digest_key" UNIQUE("token_digest"),
	CONSTRAINT "account_email_verifications_digest_check" CHECK ("account_email_verifications"."token_digest" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "account_email_verifications_expiry_check" CHECK ("account_email_verifications"."expires_at" = "account_email_verifications"."issued_at" + interval '30 minutes')
);
--> statement-breakpoint
ALTER TABLE "account_email_verifications" ADD CONSTRAINT "account_email_verifications_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_email_verifications_account_idx" ON "account_email_verifications" USING btree ("account_id");
--> statement-breakpoint
UPDATE "account_sessions" SET "revoked_at" = COALESCE("revoked_at", clock_timestamp())
WHERE "account_id" IN (SELECT "id" FROM "accounts" WHERE "email_verified_at" IS NULL);
