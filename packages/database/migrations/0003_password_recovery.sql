CREATE TABLE "account_password_recoveries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"token_digest" varchar(64) NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "account_password_recoveries_digest_key" UNIQUE("token_digest"),
	CONSTRAINT "account_password_recoveries_digest_check" CHECK ("account_password_recoveries"."token_digest" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "account_password_recoveries_expiry_check" CHECK ("account_password_recoveries"."expires_at" = "account_password_recoveries"."issued_at" + interval '30 minutes')
);
--> statement-breakpoint
ALTER TABLE "account_password_recoveries" ADD CONSTRAINT "account_password_recoveries_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_password_recoveries_account_idx" ON "account_password_recoveries" USING btree ("account_id");