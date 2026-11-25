# MST charger checks

Every 5 minutes, a GitHub Action reads the four Market Square Tower ChargePoint ports from
ChargePoint's public map and sends the reading to the MST Charging app. GitHub's own 5-minute
schedule runs late or not at all when it's busy, so each run stays up ~5¾ hours, reads every 5
minutes, and then starts the next run; the hourly schedule only restarts it if the chain breaks. The app keeps a log
of when each spot is taken and freed, which it uses to show how long each spot has been in
use and how soon one is likely to open.

This repo is public so the checks use no paid GitHub minutes. Nothing secret is stored here:
the app trusts the run through GitHub's signed OIDC token, which names this repository.
Once a month the job commits the date to `keepalive.txt`, because GitHub turns off schedules
in public repos with no commits for 60 days.
