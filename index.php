<html>
<head>
<meta http-equiv="content-type" content="text/html; charset=UTF-8">
<title>Hak Pak - Pac-Man based game</title>
<style>
    body {
        padding: 10px;
        color: beige;
        background-color: black;
        text-align: center;
    }
    #pak { height: 80%; }
    #attrib { margin-top: 30px; }
    #level, #score, #lives {
        display: inline-block;
        margin: 10px;
        width: 60px;
        border: 1px solid grey;
        text-align: center;
    }
</style>
</head>
<body>
    <canvas id="pak" height="100%"></canvas>
    <div id="dashboard">Level: <span id="level"></span> Score: <span id="score"></span> Lives: <span id="lives"></span></div>
    <div id="attrib">[ Hak Pak by Adam Gray 2013 ]</div>
    <script src="pak.js" type="text/javascript"></script>
</body>
</html>
