import os
class Settings:
    stripe_key = os.environ['STRIPE_KEY']
settings = Settings()
