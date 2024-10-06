cd /opt/daimon_backend
git checkout live
git pull
docker build -t daimon_backend .
docker-compose up -d