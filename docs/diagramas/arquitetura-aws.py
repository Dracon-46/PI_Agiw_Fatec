# Gera docs/diagramas/arquitetura-aws.png e .svg
# Uso: pip install diagrams (requer Graphviz) e, nesta pasta, python3 arquitetura-aws.py

from diagrams import Diagram, Cluster, Edge
from diagrams.aws.general import Users, User
from diagrams.aws.network import InternetGateway
from diagrams.aws.compute import EC2ElasticIpAddress
from diagrams.aws.storage import SimpleStorageServiceS3Bucket
from diagrams.aws.management import Cloudwatch, CloudwatchAlarm, CloudwatchLogs, CloudformationStack, SystemsManager
from diagrams.aws.security import IAMRole
from diagrams.onprem.network import Nginx
from diagrams.onprem.database import Mysql
from diagrams.programming.framework import Nextjs
from diagrams.onprem.vcs import Github, Git
from diagrams.onprem.ci import GithubActions
from diagrams.aws.management import CloudwatchEventTimeBased

g = {"fontsize": "20", "fontname": "Helvetica", "pad": "0.6", "nodesep": "0.7", "ranksep": "1.1", "splines": "spline", "labelloc": "t"}
n = {"fontsize": "13", "fontname": "Helvetica"}
c = {"fontsize": "14", "fontname": "Helvetica-Bold"}

with Diagram("Conciliação Bancária – Arquitetura na AWS (AWS Academy Learner Lab)", filename="arquitetura-aws",
             outformat=["png", "svg"], direction="LR", show=False, graph_attr=g, node_attr=n):
    usuarios = Users("Usuários\n(navegador)")
    admin = User("Administrador")

    with Cluster("GitHub", graph_attr=c):
        repo = Github("Repositório\nPI_Agiw_Fatec")
        ci = GithubActions("CI\nlint · testes · build · Docker")

    with Cluster("AWS Cloud · região us-east-1 · conta Learner Lab", graph_attr=c):
        cfn = CloudformationStack("CloudFormation\nconciliacao-agiw-arthur")
        role = IAMRole("LabRole\n(Instance Profile)")
        ssm = SystemsManager("Systems Manager\n(Run Command)")

        with Cluster("VPC padrão", graph_attr=c):
            igw = InternetGateway("Internet\nGateway")
            eip = EC2ElasticIpAddress("Elastic IP\n184.194.56.72")
            with Cluster("Security Group conciliacao-agiw-sg\nentrada: 443/80 público · 22 só IP admin · 3000/3306 fechadas", graph_attr=c):
                with Cluster("EC2 t3.small · Amazon Linux 2023 · EBS gp3 20 GiB criptografado", graph_attr=c):
                    nginx = Nginx("Nginx\nproxy reverso + TLS")
                    with Cluster("Docker Compose", graph_attr=c):
                        app = Nextjs("conciliacao-app\nNext.js · 127.0.0.1:3000")
                        db = Mysql("conciliacao-mysql\nMySQL 8 · 127.0.0.1:3306")
                    cron = CloudwatchEventTimeBased("cron diário\nbackup-conciliacao.sh")
                    codigo = Git("código clonado\n~/conciliacao-agiw")

        s3 = SimpleStorageServiceS3Bucket("S3 · backups mysql/\nprivado · SSE-S3 · TLS\nexpira em 30 dias")
        with Cluster("CloudWatch", graph_attr=c):
            logs = CloudwatchLogs("Logs\n/aws/conciliacao-agiw/*\nretenção 30 dias")
            metr = Cloudwatch("Métricas\nCPU · memória · disco")
            alarm = CloudwatchAlarm("Alarmes\nCPU > 80% · status check")

    usuarios >> Edge(label="HTTPS 443", color="#1f6f8b", penwidth="2") >> igw >> eip >> nginx
    nginx >> Edge(label="HTTP local") >> app >> Edge(label="SQL") >> db
    cron >> Edge(label="mysqldump") >> db
    cron >> Edge(label="upload .sql.gz", color="#7a5c00", style="dashed") >> s3
    nginx >> Edge(label="CloudWatch Agent", color="#a33a2b", style="dashed") >> logs
    app >> Edge(color="#a33a2b", style="dashed") >> metr
    metr >> alarm
    role >> Edge(label="credenciais temporárias", style="dotted") >> cron
    cfn >> Edge(label="provisiona", style="dotted", color="#555555") >> eip
    admin >> Edge(label="SSH 22 (chave .pem)", style="dashed") >> eip
    admin >> Edge(label="console / CLI", style="dashed") >> ssm >> Edge(style="dotted") >> nginx
    repo >> ci
    repo >> Edge(label="git clone / pull", style="dashed") >> codigo
    codigo >> Edge(label="docker compose\nup --build", style="dashed") >> app
